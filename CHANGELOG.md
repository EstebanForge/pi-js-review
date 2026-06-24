# Changelog

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
