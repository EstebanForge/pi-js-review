# JavaScript Review Rubric

Floor: **modern JS (ES2020+)**. Targets `.js` / `.mjs` / `.cjs`. Focuses on semantic and security flaws **Biome / ESLint do not reliably catch** (async races, prototype pollution, injection, eval/XSS, ReDoS, mutation, event-loop blocking). Each entry: severity tag, one-line rationale, and a bad→good pair (the good side is the fix template). Cite the **entry number** (e.g. `#10`), quote **file:line**, categorize (Bug / Suggestion / Nit), propose a corrected snippet. Only flag what's actually present. Note Good patterns. End with **Verdict**: Approve / Request Changes / Needs Discussion.

---

## Equality & Coercion

### #1 Loose equality `==` [Bug]
`==` coerces: `0 == ""`, `null == undefined`, `"" == 0` are all true.
- bad:  `if (count == 0) { /* runs for "", false, [], "0" */ }`
- good: `if (count === 0) { /* only true integer zero */ }`

### #2 Falsy conditional trap [Bug]
`0`, `""`, `NaN`, `null`, `undefined` are all falsy; `if (x)` skips valid values.
- bad:  `if (quantity) { process(quantity); }` // quantity = 0 silently skipped
- good: `if (quantity > 0) { process(quantity); }` // explicit, 0 is a real value

---

## Async

### #3 Missing `await` — floating promise [Bug]
A fire-and-forget promise runs unordered and its rejection is swallowed (these are "floating promises").
- bad:  `saveUser(user); notify(user);` // notify races saveUser; saveUser error vanishes
- good: `await saveUser(user); await notify(user);`

### #4 Unhandled promise rejection [Bug]
A promise with no `try/catch` (or `.catch()`) rejects with no handler — silently lost, or a crash in Node 15+.
- bad:  `fetch(url).then(r => r.json()).then(use);` // no `.catch` — rejection is unhandled
- good: `try { const r = await (await fetch(url)).json(); } catch (e) { log(e); throw e; }`

### #5 `forEach` with async callbacks [Suggestion]
`Array.forEach` ignores the returned promise (all fire, none awaited). Use `Promise.all` (concurrent) or a `for...of` loop (sequential).
- bad:  `ids.forEach(async id => { await fetch(`/u/${id}`); });` // never awaited, rejections lost
- good: `await Promise.all(ids.map(id => fetch(`/u/${id}`)));` // concurrent; use `for (const id of ids) await fetch(...)` when order/rate-limits matter

---

## Mutation & Scope

### #6 Mutating function arguments [Bug]
Arrays and objects pass by reference; mutating them leaks side effects to the caller.
- bad:  `function add(items, x) { items.push(x); return items; }`
- good: `function add(items, x) { return [...items, x]; }` // return a new array

### #7 Detached `this` (floating method reference) [Bug]
Passing `obj.method` as a callback loses its receiver; `this` becomes `undefined` (strict) or the global.
- bad:  `const log = user.getName; log();` // throws or reads the wrong `this`
- good: `const log = () => user.getName();` // or `user.getName.bind(user)`

---

## Globals & Prototypes

### #8 Extending native prototypes / globals [Bug]
Patching `Array.prototype` / `Object.prototype` or declaring globals collides with other code and breaks `for...in`.
- bad:  `Array.prototype.last = function () { return this[this.length - 1]; };`
- good: `const last = (arr) => arr[arr.length - 1];` // standalone helper, no shared mutation

### #9 Prototype pollution [Bug]
Recursively merging untrusted input lets a `__proto__` / `constructor.prototype` key rewrite `Object.prototype`, poisoning every object.
- bad:  `function merge(t, s) { for (const k in s) t[k] = s[k]; }` // `merge({}, JSON.parse('{"__proto__":{"admin":true}}'))`
- good: deny dangerous keys (`__proto__`, `prototype`, `constructor`), or merge into `Object.create(null)`, or use a safe library / `Map`.

---

## Security

### #10 `eval` / `new Function` on untrusted input [Bug]
Executes arbitrary code: RCE in Node, XSS in the browser. There is always a safe alternative.
- bad:  `const fn = eval("(function () { " + userInput + " })");`
- good: parse structured data (`JSON.parse`) and dispatch on a known set of operations.

### #11 DOM injection — `innerHTML` / `document.write` [Bug]
`el.innerHTML = userInput` renders user input as HTML. Use `textContent`, or sanitize.
- bad:  `el.innerHTML = `<p>${user.bio}</p>`;`
- good: `el.textContent = user.bio;` // or DOMPurify.sanitize(...) when HTML is required

### #12 Regex DoS (ReDoS) [Bug]
Nested quantifiers like `(a+)+` cause catastrophic backtracking on crafted input, hanging the event loop.
- bad:  `/^(a+)+$/.test(userInput)` // exponential time on long non-matching input
- good: bound input length first; prefer an unambiguous pattern (`/^a+$/`) or a non-regex check.

### #13 Hardcoded secrets in a client bundle [Bug]
Keys committed in source get bundled and shipped to the browser, leaking publicly.
- bad:  `const API_KEY = "sk_live_123456";` // bundled, publicly readable
- good: keep secrets server-side; expose via a proxy endpoint, never embed in client code.

### #14 Open redirect / SSRF from a user-controlled URL [Bug]
Redirecting to or fetching a user-supplied URL enables phishing redirects or server-side requests to internal hosts.
- bad:  `res.redirect(req.query.next);` // open redirect
- good: validate against a host allowlist. Relative-only checks leak: `/\evil.com` normalizes to `//evil.com` in browsers — parse the URL and confirm same-origin before redirecting.

### #15 Blocking the event loop (Node) [Bug]
Synchronous I/O or heavy CPU work on the main thread stalls every concurrent request.
- bad:  `const data = fs.readFileSync(path); JSON.parse(huge);` // in a request handler
- good: `const data = await fs.promises.readFile(path);` // async; offload CPU-heavy work to a worker.

### #16 Command injection — `exec` with user input [Bug]
`child_process.exec` runs through a shell, so interpolated input injects arbitrary commands. Use `execFile` / `spawn` with an arg array (no shell).
- bad:  `exec(`convert ${userFile}`, cb);` // userFile = `a.png; rm -rf ~`
- good: `execFile("convert", [userFile], cb);` // arg array — no shell, no metachar interpretation

### #17 Insecure randomness for secrets/IDs [Bug]
`Math.random()` is not cryptographic and is predictable. Use the `crypto` module for tokens, IDs, nonces, session keys.
- bad:  `const token = Math.random().toString(36).slice(2);` // predictable
- good: `const token = crypto.randomUUID();` // or `crypto.randomBytes(16).toString("hex")`

### #18 Path traversal [Bug]
Joining user input into a filesystem path lets `../` escape the base directory. Resolve and verify the result stays inside it.
- bad:  `fs.readFile(path.join(baseDir, req.params.name));` // name = `../../etc/passwd`
- good: `const safe = path.resolve(baseDir, req.params.name); if (!safe.startsWith(path.resolve(baseDir) + path.sep)) throw new Error("traversal"); fs.readFile(safe, ...);`
