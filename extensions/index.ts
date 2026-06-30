/**
 * pi-js-review — Code review powered by a curated JavaScript flaws rubric.
 *
 * Registers a js_review tool that reads JavaScript code changes (git diff)
 * and returns them alongside a lean, security-weighted rubric (numbered
 * entries, each with a bad/good pair ). Sources are documented in README. The LLM
 * reviews the diff, flags flaws, AND proposes a corrected snippet for each
 * finding.
 *
 * Targets `.js` / `.mjs` / `.cjs`. TypeScript gets its own extension
 * (pi-ts-review) since its type-system mistakes are distinct.
 *
 * Features:
 *   - Reviews staged, unstaged, commit, or range diffs filtered to JS files
 *   - Bundles the flaws rubric as a sibling .md asset (human-editable)
 *   - Focuses on flaws Biome / ESLint do not reliably catch: async races,
 *     prototype pollution, eval/XSS, ReDoS, mutation, event-loop blocking
 *   - Categorizes findings: Bug/Critical, Suggestion, Nit, Good pattern
 *   - Custom TUI rendering for call + result
 *   - System prompt injection so the agent auto-invokes when reviewing JS code
 *
 * Sibling to @estebanforge/pi-go-review, pi-php-review, pi-rust-review.
 * Pair with `biome check` (or eslint) for compiler-grade lint coverage; this
 * tool focuses on semantic and security mistakes static analyzers may not flag.
 */
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The rubric ships as a sibling markdown file (source of truth, editable). Load
// lazily; memoize only on success so a transient read failure (e.g. a
// mid-install state during a Pi hot-reload) stays recoverable on the next call
// instead of pinning the degraded message for the process lifetime. Under Pi's
// jiti loader, import.meta.url resolves to this source file, so the sibling .md
// is reachable next to it.
let _guide: string | null = null;
function getGuide(): string {
	if (_guide !== null) return _guide;
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		_guide = readFileSync(path.join(here, "js-flaws.md"), "utf8");
		return _guide;
	} catch {
		return "## JS flaws rubric unavailable\n\nThe bundled `js-flaws.md` could not be read. Reinstall the package or check the install.";
	}
}

// git argument prefix per mode; the caller pathspec(s) are appended after "--".
const STAT = ["--stat", "--patch"];
const GIT_PREFIX: Record<string, string[]> = {
	working: ["diff", ...STAT],
	staged: ["diff", "--cached", ...STAT],
	all: ["diff", "HEAD", ...STAT],
	commit: ["show", ...STAT],
	range: ["diff", ...STAT],
};

interface JsReviewDetails {
	mode: string;
	ref?: string;
	path?: string;
	insertions: number;
	deletions: number;
	jsFilesFound: number;
	truncated: boolean;
}

// Walk up from `start` to the nearest enclosing .git (directory or file).
// Returns the containing dir, or null if none — meaning there's no repo to
// anchor to (the workspace root isn't in one and no ancestor is either).
function findGitRoot(start: string): string | null {
	let dir = start;
	for (let i = 0; i < 64; i++) {
		if (existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "js_review",
		label: "JS Review",
		description:
			"Review JavaScript code changes against a focused JS flaws rubric. " +
			"Reads git diffs (staged, unstaged, commits, or ranges), filters to .js/.mjs/.cjs files, " +
			"and returns the diff alongside the rubric (numbered entries, each a bad/good pair). " +
			"Each finding cites the entry number (e.g. #10) AND proposes a corrected snippet modeled on the good example. " +
			"Use this whenever reviewing JS code, PRs, or changes before committing.",
		promptSnippet: "Review JavaScript code changes and propose corrected snippets from the JS flaws rubric",
		promptGuidelines: [
			"Use js_review when the user asks to review JS code, check JS changes, or audit a JS PR.",
			"Targets .js/.mjs/.cjs. TypeScript mistakes are out of scope (separate extension).",
			"After receiving the diff and rubric, analyze every changed JS file against relevant entries.",
			"For each finding: cite the entry number (e.g. #10), give file:line/code fragment, categorize (Bug/Critical, Suggestion, Nit), AND propose a corrected snippet modeled on the entry's good example.",
			"Only flag flaws actually present, most impactful first. Note Good patterns too.",
			"End with a verdict: Approve, Request Changes, or Needs Discussion.",
		],
		parameters: Type.Object({
			mode: StringEnum(["working", "staged", "commit", "range", "all"] as const, {
				description: "working=unstaged, staged=cached, commit=specific SHA, range=two refs, all=HEAD diff",
			}),
			ref: Type.Optional(Type.String({ description: "Commit SHA, branch, or range (e.g. main..HEAD). Required for commit/range." })),
			path: Type.Optional(Type.String({ description: "Limit to file or directory (e.g. src/api). Git runs from this path, so it can point into a nested repo." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const { mode, ref, path: filePath } = params;
			const EXTS = [".js", ".mjs", ".cjs"];
			const EXT_ALT = EXTS.map((e) => e.slice(1)).join("|");
			const MAX_LINES = 1500;
			const hasExt = (p: string) => EXTS.some((e) => p.endsWith(e));

			if ((mode === "commit" || mode === "range") && !ref) {
				throw new Error(`ref required for ${mode} mode`);
			}

			// Anchor the git invocation to the caller's path. A plain pathspec alone
			// is insufficient: git must be *run* from inside the target repo, otherwise
			// a `path` pointing into a nested repo (common in workspaces whose root is
			// not itself a git repo) yields 'not a git repository'.
			//
			// Strategy: resolve `path`, stat it, set `cwd` on the exec, and rebase the
			// pathspec relative to that cwd. Git pathspecs treat `*` as crossing `/`,
			// so plain `*.js` (etc.) recurses under cwd — no :(glob) magic needed once
			// we're standing in the right directory.
			let gitCwd = process.cwd();
			let pathspecs: string[] = EXTS.map((e) => "*" + e); // all variants, under cwd
			if (filePath) {
				const resolved = path.resolve(gitCwd, filePath);
				try {
					if (statSync(resolved).isDirectory()) {
						gitCwd = resolved;
						pathspecs = EXTS.map((e) => "*" + e);
					} else {
						gitCwd = path.dirname(resolved);
						pathspecs = [path.basename(resolved)];
					}
				} catch (err) {
					// Re-throw anything that isn't ENOENT (e.g. EACCES) so a permissions
					// error on a path that exists isn't misread as "deleted file".
					if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
					// Path doesn't exist on disk (uncommitted deletion, typo, or a path
					// only meaningful inside a nested repo we can't see from here).
					// Walk up from its parent dir to a real .git so deletions inside a
					// nested repo still anchor correctly; if no repo is reachable, gitCwd
					// stays at the workspace root and git will fail with the hint below.
					const root = findGitRoot(path.dirname(resolved));
					if (root) {
						gitCwd = root;
						const rel = path.relative(root, resolved).replace(/\\/g, "/");
						pathspecs = hasExt(resolved)
							? [rel]
							: EXTS.map((e) => `:(glob)${rel.replace(/\/+$/, "")}/**/*${e}`);
					} else {
						pathspecs = hasExt(filePath)
							? [filePath]
							: EXTS.map((e) => `:(glob)${filePath.replace(/\/+$/, "")}/**/*${e}`);
					}
				}
			}
			const gitArgs = [...GIT_PREFIX[mode], ...(ref ? [ref] : []), "--", ...pathspecs];

			const result = await pi.exec("git", gitArgs, { cwd: gitCwd, signal, timeout: 30000 });
			if (result.code !== 0) {
				const hint = /not a git repository/i.test(result.stderr)
					? " — the working directory is not inside a git repo; pass `path` pointing into the repo (a file or dir)."
					: "";
				throw new Error(`git failed (${result.code}): ${result.stderr}${hint}`);
			}

			const base = { mode, ref, path: filePath };
			if (!result.stdout.trim()) {
				return {
					content: [{ type: "text" as const, text: "No JS file changes found. Try: staged, working, all, commit, or range." }],
					details: { ...base, insertions: 0, deletions: 0, jsFilesFound: 0, truncated: false } satisfies JsReviewDetails,
				};
			}

			const lines = result.stdout.split("\n");

			// Anchor to the LAST stat line: in commit/range mode git emits the commit
			// message before the diffstat, so a message containing "N files changed"
			// would otherwise be parsed as the stat and poison the metrics.
			const statLine = lines.filter((line) => /\d+ files? changed/.test(line)).pop() ?? "";
			const insertions = parseInt(statLine.match(/(\d+) insertions?/)?.[1] ?? "0", 10);
			const deletions = parseInt(statLine.match(/(\d+) deletions?/)?.[1] ?? "0", 10);
			const jsFilesFound = result.stdout.match(new RegExp(`^diff --git a/.*\\.(?:${EXT_ALT}) b/.*\\.(?:${EXT_ALT})$`, "gm"))?.length ?? 0;

			const truncated = lines.length > MAX_LINES;
			const diffText = truncated ? lines.slice(0, MAX_LINES).join("\n") : result.stdout;

			const text = [
				`## JS Code Review: ${mode}${ref ? " " + ref : ""}${filePath ? ` (${filePath})` : ""}`,
				"",
				`**${jsFilesFound}** JS files, **+${insertions}** / **-${deletions}**`,
				"",
				"### Diff",
				"",
				"```diff",
				diffText,
				"```",
				"",
				...(truncated ? [`> Truncated to ${MAX_LINES} lines. Use path param to focus.`, ""] : []),
				"---",
				"",
				"### Review Instructions",
				"",
				"Analyze the diff against the JS flaws rubric below.",
				"For each entry found:",
				"  - cite the **entry number** (e.g. '#10 eval on untrusted input');",
				"  - give **file:line / code fragment**;",
				"  - categorize: Bug/Critical, Suggestion, or Nit;",
				"  - **propose the corrected snippet**, modeled on the entry's good example;",
				"Only flag flaws **actually present**, most impactful first. Note Good patterns too.",
				"End with **Verdict**: Approve / Request Changes / Needs Discussion.",
				"",
				getGuide(),
			].join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: { ...base, insertions, deletions, jsFilesFound, truncated } satisfies JsReviewDetails,
			};
		},
		renderCall(args, theme, _ctx) {
			const modeColors: Record<string, ThemeColor> = {
				working: "warning",
				staged: "accent",
				commit: "success",
				range: "success",
				all: "warning",
			};
			let label = theme.fg("toolTitle", theme.bold("js_review "));
			label += theme.fg(modeColors[args.mode] ?? "accent", args.mode);
			if (args.ref) label += theme.fg("muted", " " + args.ref);
			if (args.path) label += theme.fg("dim", " — " + args.path);
			label += theme.fg("dim", "  (JS flaws rubric)");
			return new Text(label, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, _ctx) {
			if (isPartial) return new Text(theme.fg("warning", "Scanning JS changes..."), 0, 0);
			const details = result.details as JsReviewDetails | undefined;
			if (!details || details.jsFilesFound === 0) return new Text(theme.fg("dim", "No JS changes found"), 0, 0);

			let summary = theme.fg("accent", details.jsFilesFound + " JS files");
			summary += theme.fg("dim", " | ") + theme.fg("success", "+" + details.insertions) + theme.fg("dim", "/") + theme.fg("error", "-" + details.deletions);
			summary += theme.fg("dim", " | ") + theme.fg("muted", "JS flaws rubric");
			if (details.truncated) summary += theme.fg("warning", " (truncated)");

			if (!expanded) return new Text(summary, 0, 0);

			summary += "\n" + theme.fg("dim", "─".repeat(50));
			const content = result.content[0];
			if (content?.type === "text") {
				const statLines = content.text.split("\n").filter((line: string) => line.includes("|") && /[+-]/.test(line)).slice(0, 8);
				for (const line of statLines) summary += "\n" + theme.fg("dim", "  " + line.trim());
				if (statLines.length === 0) summary += "\n" + theme.fg("dim", "  (expand for diff + rubric)");
			}
			return new Text(summary, 0, 0);
		},
	});
}
