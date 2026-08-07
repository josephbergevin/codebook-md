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
| `shell.ts` | `bash -c` | Handles all shell/bash/zsh/sh cells; runs the cell body verbatim under `set -e`; no output markers |
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

## Shell and bash share one config section

Shell, bash, zsh, and sh fences all resolve to `languageShellScript` and are
handled by `shell.ts`. Their settings live under **`codebook-md.bash`** —
that is the section declared in `package.json` and documented to users, so
`shell.ts` reads `codebook-md.bash` and `codebook-md.bash.output`. There is no
`codebook-md.shell` section; do not introduce one without also declaring it.

`src/test/languages/shell.test.ts` pins this down.

## Never re-tokenize a shell cell

`shell.ts` passes the cell body to `bash -c` **verbatim**. Do not parse it into
commands and arguments and rebuild the string — that is what
`codebook.parseCommands()` plus per-argument quoting used to do, and it turned
every shell operator into a literal argument:

```
user writes:  echo $PATH | tr ':' '\n'
was executed: echo "$PATH" "|" "tr" "':'" "'\n'"     # prints the pipeline
```

It broke pipes, redirects, `&&`, `;`, globs, command substitution, single
quotes, subshells, and every multi-line construct. bash already parses shell
syntax correctly; let it. `parseCommands()` is still called, but only to count
commands for `allowKeepOutput()`.

`src/test/languages/shell.test.ts` covers each of these forms.
