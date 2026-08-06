# Changelog

## 1.0.2 — 2026-08-06

### Changed
- **Dependencies updated.** Raised the `pi-coding-agent`, `pi-ai`, `pi-tui` dev pins to `^0.84.0`. Audited against the pi v0.84.0 breaking changes (renamed `ModelsRequestTransforms`, null-tolerant `getApiKeyAndHeaders` headers, dropped `message_update` partial fields, v4 session APIs); no code changes were needed and `tsc`/`typecheck` passes against 0.84.0.

## 1.0.1 — 2026-06-30

### Fixed
- **`path` into a nested git repo failed**: `git` was always run from the
  agent's workspace root (via `pi.exec` without `cwd`), so a `path` pointing
  into a nested repo — whose workspace root is not itself a git repo (e.g. a
  package under `src/...` in a multi-repo workspace) — errored `not a git
  repository`. The tool now resolves `path`, stats it, sets `cwd` on the git
  invocation, and rebases the pathspec array (`.js`/`.mjs`/`.cjs`) relative
  to that directory. Git pathspecs treat `*` as crossing `/`, so plain
  `*.js` (etc.) recurses under the new cwd.
- **Deleted files in a nested repo now resolve**: when the `path` no longer
  exists on disk (uncommitted deletion), the tool walks up from the parent
  dir to the nearest `.git` and anchors there, instead of falling back to
  the workspace root. Non-`ENOENT` errors (e.g. `EACCES`) are re-thrown
  rather than misread as a deletion.
- **Clearer failure mode**: when the working directory isn't inside any git
  repo, the thrown error now appends a hint to pass `path` pointing into the
  repo.

## 1.0.0 — 2026-06-23

Initial release. A Pi-native JavaScript code review tool, sibling to
`@estebanforge/pi-go-review`, `pi-php-review`, and `pi-rust-review`. Registers
a `js_review` tool that reads git diffs filtered to `*.js`/`*.mjs`/`*.cjs`,
attaches a focused JS flaws rubric, and for each finding cites the entry number
**and proposes a corrected snippet**.

### Added

- `js_review` tool with five diff modes: `working`, `staged`, `all`, `commit`,
  `range`, plus a `path` scope. Filters to `.js`/`.mjs`/`.cjs` via multiple git
  pathspecs.
- Bundled `extensions/js-flaws.md` rubric: **18 entries across 5 sections**
  (Equality & Coercion, Async, Mutation & Scope, Globals & Prototypes,
  Security). Security-weighted (9 of 18 entries are injection / access-control /
  crypto flaws). Each entry is a one-line rationale plus a bad→good pair (the
  good side is the fix template) with an inline severity tag. Loaded at runtime
  via `import.meta.url`. Every rule is grounded in a confirmed online source
  (MDN, OWASP, nodebestpractices, clean-code-javascript, Node.js docs);
  sources are documented in the README, not embedded in the rubric, to keep
  the per-call prompt lean.
- Positions against Biome/ESLint: focuses on semantic and security flaws
  static analyzers do not reliably catch (async races, prototype pollution,
  eval/XSS, ReDoS, mutation side-effects, event-loop blocking, command
  injection, insecure randomness, path traversal).
- Directory `path` scope uses `:(glob)dir/**/*.{js,mjs,cjs}` so non-JS files
  under the dir are excluded (a bare directory pathspec would leak them).
- Review output proposes a corrected snippet for each finding.
- Custom TUI rendering for the tool call and result.

### Notes

- Source approach: **curated hybrid** drawing from MDN, OWASP Cheat Sheet
  Series, nodebestpractices, clean-code-javascript, and the Node.js docs.
  Azat Mardan's *100 JavaScript and TypeScript Mistakes* (Manning, MEAP) is
  paywalled with no free checklist, so this rubric is curated rather than
  book-primary (same approach as the PHP extension).
