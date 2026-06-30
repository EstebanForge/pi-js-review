# @estebanforge/pi-js-review

JavaScript code review against a focused **JS flaws rubric**. Registers a `js_review` tool that reads git diffs, filters to `.js`/`.mjs`/`.cjs`, and attaches the rubric (18 entries across 5 sections, each a one-line rationale plus a bad→good pair). The rubric targets semantic and security flaws **Biome / ESLint do not reliably catch**. Every rule is grounded in a confirmed online source — see [Sources](#sources).

Sibling to [`@estebanforge/pi-go-review`](https://github.com/EstebanForge/pi-go-review), [`pi-php-review`](https://github.com/EstebanForge/pi-php-review), and [`pi-rust-review`](https://github.com/EstebanForge/pi-rust-review). Pair with `biome check` (or `eslint`) for compiler-grade lint coverage; this tool focuses on mistakes static analyzers may not flag.

## Install

```
pi install npm:@estebanforge/pi-js-review
```

## Usage

Ask Pi: **"review my JS changes."**

The tool runs `git` in one of five modes:

| Mode | Description | Needs `ref` |
| --- | --- | --- |
| `working` | Unstaged changes | No |
| `staged` | Staged (cached) changes | No |
| `all` | All changes vs HEAD | No |
| `commit` | A specific commit | Yes (SHA) |
| `range` | A commit range | Yes (e.g. `main..HEAD`) |

Narrow scope with `path` (a file or directory). The tool runs `git` **from** that path — so `path` can point into a nested repo (e.g. a package inside a workspace whose root is not itself a git repo).

## What it does

1. Reads the git diff filtered to `*.js` / `*.mjs` / `*.cjs`.
2. Attaches the JS flaws rubric (18 entries, 5 sections).
3. The LLM reviews the diff and returns findings that **propose a corrected snippet**:

| Severity | Meaning |
| --- | --- |
| Bug / Critical | Must fix |
| Suggestion | Should consider |
| Nit | Minor improvement |
| Good pattern | Well done |

Each finding cites the entry number (e.g. **#10**), the file + code fragment, and a corrected snippet. Ends with a **Verdict**: Approve / Request Changes / Needs Discussion.

## Rubric sections

| Section | Entries |
| --- | --- |
| 1. Equality & Coercion | #1 - #2 |
| 2. Async | #3 - #5 |
| 3. Mutation & Scope | #6 - #7 |
| 4. Globals & Prototypes | #8 - #9 |
| 5. Security | #10 - #18 |

Security-weighted: 9 of 18 entries are injection / access-control / crypto flaws — `#10` eval, `#11` innerHTML XSS, `#12` ReDoS, `#13` hardcoded secrets, `#14` open redirect/SSRF, `#16` command injection, `#17` insecure randomness, `#18` path traversal, plus `#9` prototype pollution. `#15` covers event-loop (availability). The rest are the async and coercion bugs that cause real outages.

## Sources

The rubric's rules were validated against confirmed online sources during research. The sources live here in the README (not embedded in the rubric) to keep the per-call prompt lean.

| # | Entry | Source |
| --- | --- | --- |
| 1 | Loose equality `==` | MDN — [Equality comparisons and sameness](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness) |
| 2 | Falsy conditional trap | MDN — [Falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy) |
| 3 | Missing `await` | [eslint-plugin-promise `no-floating-promises`](https://github.com/eslint-community/eslint-plugin-promise/issues/151) |
| 4 | Unhandled rejection | nodebestpractices — [Catch unhandled promise rejections](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/catchunhandledpromiserejection.md) |
| 5 | `forEach` with async | MDN — [Array.prototype.forEach](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach) |
| 6 | Mutating arguments | clean-code-javascript — [Avoid Side Effects](https://github.com/ryanmcdermott/clean-code-javascript) |
| 7 | Detached `this` | MDN — [this](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this) |
| 8 | Extending natives | [Why extending built-in objects is not a good idea](https://github.com/yangshun/top-javascript-interview-questions) |
| 9 | Prototype pollution | OWASP — [Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html) |
| 10 | `eval` | MDN — [eval()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval) |
| 11 | `innerHTML` XSS | OWASP — [DOM based XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html) |
| 12 | ReDoS | OWASP — [Regular expression Denial of Service](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS) |
| 13 | Hardcoded secrets | OWASP — [Secrets Management](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Secrets_Management_Cheat_Sheet.md) |
| 14 | Open redirect / SSRF | OWASP — [Unvalidated Redirects and Forwards](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) |
| 15 | Event-loop blocking | Node.js — [Don't Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) |
| 16 | Command injection | OWASP — [OS Command Injection Defense](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html) |
| 17 | Insecure randomness | MDN — [Math.random()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random) / [Crypto.randomUUID()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) |
| 18 | Path traversal | OWASP — [Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal) |

Primary authorities: [MDN Web Docs](https://developer.mozilla.org/), [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), [nodebestpractices](https://github.com/goldbergyoni/nodebestpractices), [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript) (MIT).

Note: Azat Mardan's *100 JavaScript and TypeScript Mistakes and How to Avoid Them* (Manning) exists but is paywalled (MEAP), with no free checklist; this rubric is therefore a **curated hybrid** rather than book-primary, like the PHP extension.

## TUI rendering

Custom rendering for both the tool call and its result: mode, file count, insertions/deletions, and truncation status at a glance.

## License

MIT
