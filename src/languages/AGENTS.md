# AGENTS.md — `src/languages/`

One module per executable language. See
[language-support.md](../../.agents/references/language-support.md) for the full
contract and [add-language-support](../../.agents/skills/add-language-support/SKILL.md)
for the step-by-step procedure.

## The contract

Every module exports a `Cell` class implementing `codebook.ExecutableCell` and a
`Config` class:

```ts
export interface ExecutableCell {
  execute(): ChildProcessWithoutNullStreams;
  executables(): Executable[];
  allowKeepOutput(): boolean;
  codeBlockConfig(): CodeBlockConfig;
  toString(): string;
  commentPrefixes(): string[];
  defaultCommentPrefix(): string;
}
```

## Modules

| File | Runtime | Notes |
| --- | --- | --- |
| `go.ts` | `go run` / `go test` | Largest; `execType` selects `execTypeRunConfig` or `execTypeTestConfig` (build tag `playground`) |
| `shell.ts` | `bash -c` | Collapses parsed commands into one `set -e` script; no output markers |
| `bash.ts` | `bash` | `execSingleLineAsCommand` runs one-line cells as a bare command |
| `javascript.ts` | `node` | Smallest complete implementation — start here |
| `typescript.ts` | `ts-node` | Mirrors `javascript.ts` |
| `python.ts` | `pythonCmd` (default `python3`) | |
| `sql.ts` | user-specified CLI | Driven by the `execOptions` setting |
| `http.ts` | `curl` | Converts the block to a curl invocation |
| `unsupported.ts` | none | Fallback rendering an install hint or "not supported" |

## Rules for this directory

- **Read config through the module's `Config` class**, constructed from
  `workspace.getConfiguration('codebook-md.<lang>')`. Do not read settings from
  the `Cell` constructor directly.
- **Let a per-cell `execPath` directive win** over the configured one:
  ```ts
  if (this.config.contentConfig.execPath) {
    this.config.execPath = this.config.contentConfig.execPath;
  }
  ```
- **Wrap output in markers when the runtime is noisy.** If anything can print
  before or after the user's code, emit `codebook.StartOutput` and
  `codebook.EndOutput` around it. Shell does not need them; Go, Node, and
  ts-node do.
- **Write temp files via `io.writeDirAndFileSyncSafe()`** inside a
  `beforeExecuteFunc`, not in the constructor body.
- **Put the binary-availability check in `NewExecutableCell()`** in
  `../codebook.ts` using `io.commandNotOnPath(cmd, installUrl)`, returning
  `unsupported.Cell` when it fails — not in the `Cell` constructor.
- **`commentPrefixes()` drives `[>]` directive parsing.** List every prefix the
  language uses, including block-comment markers.
- **`allowKeepOutput()` is `false` once there is more than one executable**,
  because interleaved output cannot be safely preserved.

## Registration checklist

A new language is not done until all six are true:

1. `Language` constant added and appended to the `languages` array in `../codebook.ts`
2. `src/languages/<lang>.ts` created
3. `case` added to `NewExecutableCell()` with a `commandNotOnPath` guard
4. `codebook-md.<lang>` settings declared in `package.json`
5. `getLanguageConfigOptions()` in `../cellConfig.ts` updated if it has per-cell options
6. Test in `src/test/languages/<lang>.test.ts`; `README.md` and
   `documentation.html` updated

## Known inconsistency

`shell.ts` reads `codebook-md.shell` / `codebook-md.shell.output`, but
`package.json` declares only `codebook-md.bash`. Shell cells therefore fall back
to defaults. Worth reconciling if you are working here anyway.
