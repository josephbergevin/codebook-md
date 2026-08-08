# CodebookMD — Execution & Configuration Audit

**Date:** 2026-08-08
**Version audited:** 0.21.4 (`b45b124`)
**Scope:** Cell execution for all supported languages, the settings surface
(`package.json` → runtime), the code-block config modal, and in-cell
(`[>]`) configuration commands.

**Baseline at time of audit:** `npm test` → 158 passed / 13 suites.
`npm run lint` → clean. No source changes were made.

Each finding below is written to be picked up independently: symptom,
evidence, recommended fix, and how to verify it.

---

## Summary

| # | Issue | Severity | Verified |
| --- | --- | --- | --- |
| **A. In-cell configuration** | | | |
| [A-1](#a-1) | Modal suggests output commands the parser silently discards | Critical | ✅ |
| [A-2](#a-2) | `.execPath("…")` parses to a literal string and creates a junk directory | Critical | ✅ |
| [A-3](#a-3) | `.output.timestampTimezone(…)` is not implemented | High | ✅ |
| **B. Execution correctness** | | | |
| [B-1](#b-1) | SQL cells cannot run — `execCmd` is empty and undeclared | Critical | ✅ |
| [B-2](#b-2) | SQL re-runs statement 1 alongside every later statement | High | ✅ |
| [B-3](#b-3) | HTTP request bodies are never sent | High | ✅ |
| [B-4](#b-4) | HTTP body path throws `TypeError` once B-3 is fixed | High | 📖 |
| **C. Settings that are read but ignored** | | | |
| [C-1](#c-1) | `output.replaceOutputCell: false` is impossible to set | High | ✅ |
| [C-2](#c-2) | Per-language `output.*` cannot override a global `true` with `false` | High | ✅ |
| [C-3](#c-3) | `http.verbose: false` is ignored — curl always gets `-v` | Medium | ✅ |
| [C-4](#c-4) | `python.pythonCmd` is a dead setting (code reads `execCmd`) | Medium | 📖 |
| [C-5](#c-5) | JavaScript output config reads a typo'd section | Medium | 📖 |
| [C-6](#c-6) | `execFilename` is read but never declared (python/js/ts) | Low | 📖 |
| [C-7](#c-7) | Modal's language-specific cell config is write-only | High | 📖 |
| **D. Settings schema & UI** | | | |
| [D-1](#d-1) | Language settings are nested objects — invisible in the Settings UI | High | 📖 |
| [D-2](#d-2) | `timestampTimezone` declared `type: string` with `default: true` | Low | ✅ |
| **E. Documentation** | | | |
| [E-1](#e-1) | Go docs list setting names that don't exist | Medium | ✅ |
| [E-2](#e-2) | Docs say "gear icon in the toolbar" — it's a cell status bar item | Low | ✅ |
| [E-3](#e-3) | `execPath` default differs between code and `package.json` | Low | ✅ |
| **F. Command registration** | | | |
| [F-1](#f-1) | 16 commands registered but not declared | Medium | ✅ |
| [F-2](#f-2) | 6 commands declared but never registered | Medium | ✅ |

✅ = reproduced by running the code · 📖 = established by reading the code

**What works today:** Go (run + test modes, including the inline
`// [>].execPath:` form), shell/bash (the verbatim `bash -c` path is solid),
JavaScript, Python, HTTP GET requests, output markers, timestamps, execution
history, and the `.output.*` inline command form.

---

## A. In-cell configuration

This is the affordance meant to spare users the Settings UI. It is currently
broken end to end: the UI emits one syntax, the parser accepts another.

<a id="a-1"></a>
### A-1 · Modal suggests output commands the parser silently discards

**Severity:** Critical · **Verified**

**Symptom.** A user opens the config modal, clicks `+` on a suggested command,
and it lands in the cell. Nothing changes on the next run. No warning is shown.

**Evidence.** [`availableCommands()`](src/codebook.ts#L1006) produces:

```
# [>].showExecutableCodeInOutput(true)
# [>].replaceOutputCell(true)
# [>].showTimestamp(true)
# [>].timestampTimezone("UTC")
# [>].execPath("")
```

[`OutputConfig`](src/codebook.ts#L1124) only inspects commands starting with
`.output.`:

```ts
const outputCommands = commands.filter(command => command.startsWith(".output."));
```

Everything above fails that filter, so it is never parsed *and* never reaches
the `default:` branch that would warn. Confirmed: a cell containing
`# [>].showTimestamp(false)` still evaluates `showTimestamp === true`, with
zero warnings emitted.

The working form is `# [>].output.showTimestamp(true)`, documented once at
[README.md:306](README.md#L306) and offered by the UI nowhere.

**Recommended fix.** Emit the `.output.` prefix from `availableCommands()`, and
keep the dedupe check aligned with the emitted name:

```ts
availableCommands(): string[] {
  const outputConfig = workspace.getConfiguration('codebook-md.output');
  const outputKeys = Object.keys(JSON.parse(JSON.stringify(outputConfig)));

  const available: string[] = [];
  for (const key of outputKeys) {
    const name = `.output.${key}`;
    if (this.commands.some(c => c.startsWith(name))) {
      continue;
    }
    available.push(key === 'timestampTimezone' ? `${name}("UTC")` : `${name}(true)`);
  }
  // …execPath (see A-2) and the Go-specific commands follow
  return available;
}
```

Note the Go-specific commands (`.execTypeRunFilename("…")`,
`.execTypeTestBuildTag("…")`, `.excludeOutputPrefixes([…])`) already use a shape
[go.ts](src/languages/go.ts#L334) parses correctly — leave those alone.

**Also fix:** unrecognised commands should warn rather than vanish. Move the
"unknown command" notice so it fires for any `[>]` command that no parser
claimed, not only for `.output.`-prefixed ones.

**Verify.** Add a test asserting a cell with `# [>].output.showTimestamp(false)`
yields `showTimestamp === false`, and that every string returned by
`availableCommands()` round-trips through `OutputConfig` to a changed value.

---

<a id="a-2"></a>
### A-2 · `.execPath("…")` parses to a literal string and creates a junk directory

**Severity:** Critical · **Verified**

**Symptom.** Adding the modal's suggested `.execPath("./sub")` sets the cell's
working directory to the literal text `.execPath("./sub")`. Because
[`mkdirIfNotExistsSafe`](src/io.ts#L137) creates missing exec directories, a
directory with that literal name gets created on disk.

**Evidence.** [codebook.ts:998](src/codebook.ts#L998) parses with
`.split(" ").pop()`:

```ts
this.execPath = this.commands.find(c => c.startsWith(".execPath"))?.split(" ").pop() || "";
```

Measured results:

| Cell content | Parsed `execPath` |
| --- | --- |
| `# [>].execPath("./sub")` | `.execPath("./sub")` ❌ |
| `# [>].execPath: ./sub` | `./sub` ✅ |

Only the colon form works — and it is suggested by neither the modal nor the
docs. It is used internally by [go.ts:75](src/languages/go.ts#L75).

**Recommended fix.** Accept both forms explicitly and treat an empty value as
"unset" so the `("")` placeholder is inert:

```ts
function parseExecPathCommand(commands: string[]): string {
  const cmd = commands.find(c => c.startsWith('.execPath'));
  if (!cmd) {
    return "";
  }
  const quoted = cmd.match(/^\.execPath\(\s*"([^"]*)"\s*\)/);
  if (quoted) {
    return quoted[1].trim();
  }
  const colon = cmd.match(/^\.execPath:\s*(.+)$/);
  return colon ? colon[1].trim() : "";
}
```

Then pick one canonical form for the modal to suggest — recommend
`.execPath("./relative/path")`, since it matches the Go commands and the
`(value)` convention everywhere else.

**Verify.** Table-driven test over both syntaxes plus the `("")` placeholder,
asserting the placeholder yields `""` and never reaches `mkdirSync`.

---

<a id="a-3"></a>
### A-3 · `.output.timestampTimezone(…)` is not implemented

**Severity:** High · **Verified**

**Symptom.** `# [>].output.timestampTimezone("MST")` shows the user
`output command unknown: .output.timestampTimezone("MST")`. Timezone cannot be
set per cell, despite the modal offering it and `validTimezone()` supporting
abbreviations like `MST` and `PDT`.

**Evidence.** [codebook.ts:1127](src/codebook.ts#L1127) switches on exact
literal strings, so parameterised commands can never match and fall through to
the `default:` warning at [line 1148](src/codebook.ts#L1148).

**Recommended fix.** Replace the literal switch with a regex parse that handles
booleans and strings uniformly — this also future-proofs the list against new
output keys:

```ts
outputCommands.forEach(command => {
  const m = command.match(/^\.output\.(\w+)\((.*)\)$/);
  if (!m) {
    window.showWarningMessage(`output command unknown: ${command}`);
    return;
  }
  const [, key, rawValue] = m;
  const value = rawValue.replace(/^"|"$/g, '');
  switch (key) {
    case 'showExecutableCodeInOutput':
    case 'replaceOutputCell':
    case 'showTimestamp':
      this[key] = value === 'true';
      break;
    case 'timestampTimezone':
      this.timestampTimezone = validTimezone(value);
      break;
    default:
      window.showWarningMessage(`output command unknown: ${command}`);
  }
});
```

**Verify.** Assert `.output.timestampTimezone("MST")` resolves to
`America/Phoenix`, and that a genuinely bogus command still warns.

---

## B. Execution correctness

<a id="b-1"></a>
### B-1 · SQL cells cannot run — `execCmd` is empty and undeclared

**Severity:** Critical · **Verified**

**Symptom.** Any `sql` cell fails with `bash: -e: command not found`.

**Evidence.** [sql.ts:127](src/languages/sql.ts#L127) reads `execCmd`, which is
**not declared** in `package.json` and defaults to `''`. The generated script
for `SELECT 1;` is:

```bash
#!/bin/bash

set -e

echo "!!output-start-cell"
 -e "SELECT 1;"
echo "!!output-end-cell"
```

`codebook-md.sql` declares only `execOptions`, and
[documentation.html:755](src/webview/templates/documentation.html#L755) doesn't
mention `execCmd` either — so there is no discoverable way for a user to fix it.

**Recommended fix.** Two parts:

1. Declare the setting (flat — see [D-1](#d-1)):

```json
"codebook-md.sql.execCmd": {
  "type": "string",
  "default": "mysql",
  "description": "CLI command used to execute SQL code blocks (e.g. 'mysql', 'psql')."
}
```

2. Fail loudly instead of emitting a broken script. In the `sql.Cell`
   constructor, when `config.execCmd` is empty, set `mainExecutable` to an
   `echo` explaining that `codebook-md.sql.execCmd` must be configured —
   mirroring the pattern already used for empty shell cells at
   [shell.ts:34](src/languages/shell.ts#L34).

**Verify.** Test that an unset `execCmd` produces the guidance message and never
a script beginning with a bare ` -e`.

---

<a id="b-2"></a>
### B-2 · SQL re-runs statement 1 alongside every later statement

**Severity:** High · **Verified**

**Symptom.** In a multi-statement SQL cell, statement 2 executes
`statement 1; statement 2`. For a cell of `INSERT`s this means duplicate writes.

**Evidence.** The constructor mutates the shared `execOptions` array to bake in
the first statement ([sql.ts:43](src/languages/sql.ts#L43)):

```ts
this.config.execOptions.push("-e " + '"' + this.innerScope + '"');
```

Each post-executable then appends its own `-e` to that already-mutated array
([sql.ts:73](src/languages/sql.ts#L73)). Measured script for statement 2:

```bash
 -e "SELECT 1;" -e "SELECT 2;"
```

**Recommended fix.** Treat `execOptions` as immutable connection options and
build the `-e` argument per statement:

```ts
const connOptions = this.config.execOptions.join(" ");
const scriptFor = (stmt: string) =>
  `#!/bin/bash\n\nset -e\n\n` +
  `echo "${codebook.StartOutput}"\n` +
  `${this.config.execCmd} ${connOptions} -e "${stmt}"\n` +
  `echo "${codebook.EndOutput}"`;
```

Use `scriptFor(sqlStatements[0])` for `mainExecutable` and
`scriptFor(stmt)` for each post-executable.

**Verify.** Test a three-statement cell and assert each generated script
contains exactly one `-e`.

---

<a id="b-3"></a>
### B-3 · HTTP request bodies are never sent

**Severity:** High · **Verified**

**Symptom.** The POST example in [README.md:305](README.md#L305) and in the
documentation view sends no body, and adds a malformed header instead.

**Evidence.** [http.ts:59](src/languages/http.ts#L59) strips *all* blank lines
before parsing:

```ts
const lines = httpRequest.split('\n')
  .filter(line => !line.trim().startsWith('#') && line.trim() !== '');
```

That destroys the blank line separating headers from body, so `inBody` never
flips and body lines fall into the header branch. Measured output for a POST
with a JSON body:

```
curl -X POST "https://api.example.com/data" -v -H "Content-Type: application/json" -H "{"a": 1}"
```

No `--data-binary`, and an unquoted brace in a header value.

**Recommended fix.** Drop comment lines only, preserve interior blank lines, and
trim just the leading/trailing ones:

```ts
const lines = httpRequest.split('\n')
  .filter(line => !line.trim().startsWith('#'));
while (lines.length && lines[0].trim() === '') { lines.shift(); }
while (lines.length && lines[lines.length - 1].trim() === '') { lines.pop(); }
```

Fix [B-4](#b-4) in the same change — it is only latent because this path is
currently unreachable.

**Verify.** Test that a POST with a JSON body produces `--data-binary
@http_request_body.json` and exactly the headers declared above the blank line.

---

<a id="b-4"></a>
### B-4 · HTTP body path throws `TypeError` once B-3 is fixed

**Severity:** High · **Code-read**

**Symptom.** None today — the branch is unreachable because of
[B-3](#b-3). It will crash the cell as soon as B-3 is fixed.

**Evidence.** [http.ts:135](src/languages/http.ts#L135) calls
`this.mainExecutable.addBeforeExecuteFunc(...)` from inside
`convertHttpRequestToCurl()`, which is invoked at
[line 29](src/languages/http.ts#L29) — but `this.mainExecutable` is not assigned
until [line 43](src/languages/http.ts#L43).

**Recommended fix.** Make `convertHttpRequestToCurl` pure and register the body
write after the executable exists:

```ts
const { curl, body } = this.buildCurl(this.innerScope);
// …construct this.mainExecutable…
if (body !== undefined) {
  const bodyFilePath = path.join(this.config.execPath, 'http_request_body.json');
  this.mainExecutable.addBeforeExecuteFunc(() => fs.writeFileSync(bodyFilePath, body));
}
```

**Verify.** Covered by the B-3 test — it cannot pass unless this is fixed too.

---

## C. Settings that are read but ignored

<a id="c-1"></a>
### C-1 · `output.replaceOutputCell: false` is impossible to set

**Severity:** High · **Verified**

**Symptom.** Setting `codebook-md.output.replaceOutputCell` to `false` has no
effect; output is always replaced rather than appended.

**Evidence.** [codebook.ts:1108](src/codebook.ts#L1108):

```ts
this.replaceOutputCell = outputConfig.get('replaceOutputCell') || true;
```

`false || true` is always `true`. Confirmed by running `OutputConfig` with the
setting explicitly `false` — the result is `true`.

**Recommended fix.** Use `??` so only `undefined` falls back:

```ts
this.replaceOutputCell = outputConfig.get<boolean>('replaceOutputCell') ?? true;
```

Audit the neighbouring lines while here — `showExecutableCodeInOutput` and
`showTimestamp` use `|| false`, which happens to be correct but should use `??`
for consistency.

**Verify.** Test each of the four output settings at both `true` and `false`.

---

<a id="c-2"></a>
### C-2 · Per-language `output.*` cannot override a global `true` with `false`

**Severity:** High · **Verified**

**Symptom.** With `codebook-md.output.showTimestamp: true` globally and
`codebook-md.go.output.showTimestamp: false`, Go cells still show a timestamp.
Language-level settings can only ever turn things *on*.

**Evidence.** [codebook.ts:1117-1120](src/codebook.ts#L1117):

```ts
this.showTimestamp = languageOutputConfig.get('showTimestamp') || this.showTimestamp;
```

Confirmed by running that exact combination — result is `true`.

**Recommended fix.** Check for `undefined` explicitly, since "not set" and
"set to false" are different states:

```ts
if (languageOutputConfig) {
  const get = <T>(key: string): T | undefined => languageOutputConfig.get<T>(key);
  const showCode = get<boolean>('showExecutableCodeInOutput');
  if (showCode !== undefined) { this.showExecutableCodeInOutput = showCode; }
  const replace = get<boolean>('replaceOutputCell');
  if (replace !== undefined) { this.replaceOutputCell = replace; }
  const timestamp = get<boolean>('showTimestamp');
  if (timestamp !== undefined) { this.showTimestamp = timestamp; }
  const tz = get<string>('timestampTimezone');
  if (tz !== undefined) { this.timestampTimezone = validTimezone(tz); }
}
```

This is the same pattern the cell-config block at
[codebook.ts:1157](src/codebook.ts#L1157) already uses correctly — worth
extracting into a shared helper so the three precedence layers (global →
language → cell) stay consistent.

**Verify.** Test the full precedence chain: global `true` → language `false` →
cell `true`, asserting the cell wins.

---

<a id="c-3"></a>
### C-3 · `http.verbose: false` is ignored — curl always gets `-v`

**Severity:** Medium · **Verified**

**Evidence.** [http.ts:189](src/languages/http.ts#L189) — same `|| true` bug as
[C-1](#c-1):

```ts
this.verbose = httpConfig?.get('verbose') || true;
```

Confirmed: a GET cell produces `curl -X GET "https://example.com" -v`
regardless of the setting.

**Recommended fix.** `this.verbose = httpConfig?.get<boolean>('verbose') ?? true;`

**Verify.** Test that `verbose: false` produces a curl command without `-v`.

---

<a id="c-4"></a>
### C-4 · `python.pythonCmd` is a dead setting

**Severity:** Medium · **Code-read**

**Symptom.** Changing `codebook-md.python.pythonCmd` does nothing. Python always
runs under `python3`.

**Evidence.** Three places name the setting `pythonCmd` — `package.json`,
[documentation.html:642](src/webview/templates/documentation.html#L642), and
[cellConfig.ts:121](src/cellConfig.ts#L121) (which drives the modal's form) —
but [python.ts:81](src/languages/python.ts#L81) reads `execCmd`:

```ts
this.execCmd = pythonConfig?.get('execCmd') || 'python3';
```

The same value also gates the "is Python installed?" check at
[codebook.ts:326](src/codebook.ts#L326).

**Recommended fix.** Pick one name. Recommend keeping `execCmd` for consistency
with `http.execCmd` and `sql.execCmd`, then update `package.json`,
`cellConfig.ts`, and the documentation template. If `pythonCmd` has shipped
long enough to have users, read `execCmd` with a `pythonCmd` fallback for one
release and note the rename in `CHANGELOG.md`.

**Verify.** Test that the configured command reaches `mainExecutable.command`.

---

<a id="c-5"></a>
### C-5 · JavaScript output config reads a typo'd section

**Severity:** Medium · **Code-read**

**Symptom.** `codebook-md.javascript.output.*` settings never apply to JS cells.

**Evidence.** [javascript.ts:79](src/languages/javascript.ts#L79):

```ts
this.contentConfig = new codebook.CodeBlockConfig(
  notebookCell, workspace.getConfiguration('codebook-javascript.bash.output'), "//");
```

The section `codebook-javascript.bash.output` does not exist.

**Recommended fix.** `workspace.getConfiguration('codebook-md.javascript.output')`.

**Verify.** Test asserting the JS cell's `outputConfig` reflects
`codebook-md.javascript.output`. Worth adding the equivalent assertion for every
language — this is exactly the kind of typo a per-language test would have
caught.

---

<a id="c-6"></a>
### C-6 · `execFilename` is read but never declared

**Severity:** Low · **Code-read**

**Evidence.** [python.ts:80](src/languages/python.ts#L80),
[javascript.ts:78](src/languages/javascript.ts#L78) and
[typescript.ts:77](src/languages/typescript.ts#L77) all read `execFilename`, but
only `codebook-md.http.execFilename` is declared in `package.json`. Users get an
"Unknown Configuration Setting" warning if they try to set it.

**Recommended fix.** Declare `codebook-md.python.execFilename`
(`codebook_md_exec.py`), `codebook-md.javascript.execFilename`
(`codebook_md_exec.js`), `codebook-md.typescript.execFilename`
(`codebook_md_exec.ts`), and `codebook-md.sql.execFilename`
(`codebook_md_exec.sql`) — all flat, per [D-1](#d-1).

**Verify.** Add a test that walks the language modules' `get()` calls and
asserts every key exists in `package.json`. This would catch C-4, C-6 and B-1
in one assertion.

---

<a id="c-7"></a>
### C-7 · Modal's language-specific cell config is write-only

**Severity:** High · **Code-read**

**Symptom.** Setting a language option in the config modal reports
"Cell configuration saved with N settings" and then changes nothing at
execution time — for every language except Go's `execType`.

**Evidence.** The modal writes to `<notebook>.config.json` via
[`saveCellConfig`](src/cellConfig.ts#L20), surfaced as
`CodeBlockConfig.cellConfig`. Only two consumers exist:

- [`OutputConfig`](src/codebook.ts#L1154) — reads `cellConfig.output.*` ✅
- [go.ts:387](src/languages/go.ts#L387) — reads `execType` and `execPathTest` ✅

Nothing reads `pythonCmd`, `execOptions`, `execCmd`, or `verbose` from
`cellConfig`, even though [cellConfig.ts:78](src/cellConfig.ts#L78) renders
form fields for all of them.

**Recommended fix.** Give each language `Config` constructor a consistent
three-layer resolution. A small shared helper keeps it honest:

```ts
// resolve: cell config → language settings → default
export function resolveSetting<T>(
  cellConfig: Record<string, unknown> | undefined,
  languageConfig: WorkspaceConfiguration | undefined,
  key: string,
  fallback: T,
): T {
  const fromCell = cellConfig?.[key];
  if (fromCell !== undefined) {
    return fromCell as T;
  }
  return languageConfig?.get<T>(key) ?? fallback;
}
```

Then e.g. in `python.Config`:

```ts
this.execCmd = resolveSetting(this.contentConfig.cellConfig, pythonConfig, 'execCmd', 'python3');
```

Apply to python (`execCmd`, `execFilename`), sql (`execCmd`, `execOptions`),
http (`execCmd`, `verbose`, `execFilename`), js/ts (`execFilename`).

**Verify.** For each language, a test that sets the option in `cellConfig` only
and asserts it reaches the built `Command`.

---

## D. Settings schema & UI

<a id="d-1"></a>
### D-1 · Language settings are nested objects — invisible in the Settings UI

**Severity:** High · **Code-read**

**Symptom.** `codebook-md.go`, `.bash`, `.python`, `.sql`, `.http`,
`.javascript`, `.typescript` render in the Settings UI as an "Edit in
settings.json" link rather than as real controls. Additionally, every documented
per-language default never applies.

**Evidence.** All are declared as `"type": "object"` with nested `properties`.
This directly violates non-negotiable rule #2 in [AGENTS.md](AGENTS.md).

Two distinct consequences:

1. VS Code renders object-typed settings as a JSON edit link, not as inputs.
2. Defaults declared inside a nested `properties` block are **never registered**.
   Since e.g. `codebook-md.go` has no top-level `default`, a call to
   `getConfiguration('codebook-md.go.output').get('showTimestamp')` returns
   `undefined` until the user hand-writes the whole object — which is why the
   `|| fallback` chains in [C-1](#c-1)/[C-2](#c-2) exist at all.

**Recommended fix.** Flatten to dotted keys. This is source-compatible: VS Code
resolves a flat `codebook-md.go.execType` for `getConfiguration('codebook-md.go').get('execType')`,
so **no language-module changes are needed** — this is a `package.json`-only
change plus a docs pass.

```json
"codebook-md.go.execType": {
  "type": "string",
  "enum": ["run", "test"],
  "default": "run",
  "description": "Execution type for Go code: 'run' uses execTypeRunConfig, 'test' uses execTypeTestConfig."
},
"codebook-md.go.output.showTimestamp": {
  "type": "boolean",
  "default": true,
  "description": "Show the timestamp at the top of Go cell output."
}
```

`execTypeRunConfig` / `execTypeTestConfig` may stay object-typed, but they need
a **top-level** `default` so their defaults actually register.

Follow [add-configuration-setting](.agents/skills/add-configuration-setting/SKILL.md)
for the mechanics. Sequence this **after** [C-1](#c-1) and [C-2](#c-2) — once
defaults genuinely register, the `||` bugs change behaviour rather than staying
masked.

**Verify.** Open the Settings UI, filter on `codebook-md`, and confirm each
language option renders as a control with its default shown.

---

<a id="d-2"></a>
### D-2 · `timestampTimezone` declared `type: string` with `default: true`

**Severity:** Low · **Verified**

**Evidence.** All eight declarations of `timestampTimezone` in `package.json`
(the global one plus one per language) carry `"type": "string"` with
`"default": true`. Type-mismatched, and VS Code will flag it.

**Recommended fix.** `"default": "UTC"` in all eight places. Fold into the
[D-1](#d-1) flattening pass.

**Verify.** A schema test asserting every declared `default` matches its
declared `type` — cheap, and guards the whole `contributes.configuration` block.

---

## E. Documentation

<a id="e-1"></a>
### E-1 · Go docs list setting names that don't exist

**Severity:** Medium · **Verified**

**Evidence.** [documentation.html:515](src/webview/templates/documentation.html#L515)
documents:

```json
"codebook-md.go": {
  "execTypeRunFilename": "main.go",
  "execTypeTestFilename": "codebook_md_exec_test.go",
  "execTypeTestBuildTag": "playground"
}
```

None of those exist as settings. The real ones are
`execTypeRunConfig.filename`, `execTypeTestConfig.filename`, and
`execTypeTestConfig.buildTag`.

The confusion is understandable: `execTypeRunFilename` *is* a valid **in-cell
command** (`// [>].execTypeRunFilename("main.go")`, parsed at
[go.ts:334](src/languages/go.ts#L334)). It is not a settings key.

**Recommended fix.** Correct the settings block and add a separate short table
distinguishing settings keys from in-cell command names. Mirror the correction
in `README.md`.

**Verify.** Cross-check every JSON key in the documentation template against
`package.json`.

---

<a id="e-2"></a>
### E-2 · Docs say "gear icon in the toolbar" — it's a cell status bar item

**Severity:** Low · **Verified**

**Evidence.** Six places in the documentation template say "Click the gear icon
in the code block toolbar". The gear is registered via
`registerNotebookCellStatusBarItemProvider` at
[extension.ts:627](src/extension.ts#L627), so it appears in the cell **status
bar** (below the cell), not the toolbar. `notebook/cell/title` contributes only
the two chat commands.

**Recommended fix.** Reword to "click the gear icon in the status bar below the
code block". Consider also contributing `codebook-md.openCodeBlockConfig` to
`notebook/cell/title` so the docs become true in the more discoverable sense —
that depends on [F-1](#f-1) landing first.

---

<a id="e-3"></a>
### E-3 · `execPath` default differs between code and `package.json`

**Severity:** Low · **Verified**

**Evidence.** [config.ts:43](src/config.ts#L43) falls back to
`"./codebook-md-exec/"`; `package.json` declares `"./codebook-md/"`. Harmless
today because the declared default wins at runtime, but the code fallback is
reachable in tests and if the declaration is ever dropped.

`cellConfig.ts:221` uses a third value, `'./codebook-md/'`, as its own fallback.

**Recommended fix.** Single source of truth — export a
`DEFAULT_EXEC_PATH = './codebook-md/'` constant and use it in both call sites,
matching `package.json`.

---

## F. Command registration

<a id="f-1"></a>
### F-1 · 16 commands registered but not declared

**Severity:** Medium · **Verified**

**Symptom.** These commands do not appear in the Command Palette. They still
work when invoked from a UI element that references them directly (which is why
the config gear functions), but they are undiscoverable.

**Evidence.** Registered in `activate()` with no `contributes.commands` entry:

```
codebook-md.openDocumentation          codebook-md.openNotebooks
codebook-md.openCodeBlockConfig        codebook-md.helloGo
codebook-md.openSettings               codebook-md.openNotebooksView
codebook-md.renameFolderInMyNotebooks  codebook-md.addSubFolderToMyNotebooksFolder
codebook-md.addFileToMyNotebooksFolder codebook-md.removeFolderFromMyNotebooksFolder
codebook-md.removeFileFromMyNotebooksFolder codebook-md.renameFileInMyNotebooks
codebook-md.removeObjectFromFolderGroup codebook-md.moveFolderGroupEntityUp
codebook-md.moveFolderGroupEntityDown  codebook-md.refreshNotebooksView
```

This violates non-negotiable rule #1 in [AGENTS.md](AGENTS.md).

**Recommended fix.** Declare each in `contributes.commands` with a title and
`"category": "CodebookMD"`. For the tree-context-menu-only commands
(`rename…`, `remove…`, `move…`), add `"enablement": "false"` or gate them behind
a `when` clause in `menus` so they don't clutter the palette with actions that
need a tree selection. See
[add-vscode-command](.agents/skills/add-vscode-command/SKILL.md).

**Verify.** Add a test that parses `src/extension.ts` for `registerCommand`
calls and asserts each has a `package.json` declaration — and vice versa, which
also covers [F-2](#f-2).

---

<a id="f-2"></a>
### F-2 · 6 commands declared but never registered

**Severity:** Medium · **Verified**

**Symptom.** These appear in the Command Palette and fail with
"command not found" when invoked.

**Evidence.** Declared in `contributes.commands` with no `registerCommand` call:

```
codebook-md.go.open                    codebook-md.go
codebook-md.addCurrentFileToFavorites  codebook-md.addFileToFolder
codebook-md.addSubFolder               codebook-md.removeFolderFromFolderGroup
```

**Recommended fix.** For each, decide: implement it, or delete the declaration.
`codebook-md.go` and `codebook-md.go.open` look like remnants of the
[`helloLanguage`](src/codebook.ts#L1228) scaffold, which is itself a stub that
only logs. The three folder commands appear superseded by the
`…MyNotebooksFolder` variants in [F-1](#f-1) — most likely a rename that only
updated one side.

**Verify.** Same bidirectional test as [F-1](#f-1).

---

## Suggested sequencing

Four commits, ordered so each is independently shippable and no fix is masked by
another:

1. **`fix(config)` — the settings-precedence bugs.**
   [C-1](#c-1), [C-2](#c-2), [C-3](#c-3), [C-5](#c-5).
   Small, self-contained, and the prerequisite for [D-1](#d-1) meaning anything.

2. **`fix(codebook)` — make in-cell configuration real.**
   [A-1](#a-1), [A-2](#a-2), [A-3](#a-3), plus [C-7](#c-7).
   This is the headline user-facing repair: the modal's suggestions start
   working, and per-cell language options stop being write-only.

3. **`fix(languages)` — SQL and HTTP execution.**
   [B-1](#b-1), [B-2](#b-2), [B-3](#b-3), [B-4](#b-4), [C-4](#c-4), [C-6](#c-6).
   B-3 and B-4 must land together.

4. **`fix(package)` — schema, docs, and command registration.**
   [D-1](#d-1), [D-2](#d-2), [E-1](#e-1), [E-2](#e-2), [E-3](#e-3),
   [F-1](#f-1), [F-2](#f-2).
   Largely mechanical once the behaviour above is settled.

Three tests are worth writing regardless of sequence, because each would have
caught several findings at once:

- Every `get()` key in `src/languages/` exists in `package.json` → B-1, C-4, C-6.
- Every `registerCommand` has a declaration and vice versa → F-1, F-2.
- Every string from `availableCommands()` round-trips to a changed config value
  → A-1, A-2, A-3.
