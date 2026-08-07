# Language Support

Everything under `src/languages/` implements one executable language. A
language module is small and predictable: a `Cell` class and a `Config` class.

## The `ExecutableCell` contract

Defined in `src/codebook.ts`:

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

| Method | Responsibility |
| --- | --- |
| `execute()` | Run the main executable and return the child process |
| `executables()` | Every executable this cell will run, main first |
| `allowKeepOutput()` | Whether prior output may be preserved — conventionally `true` only when there is a single executable |
| `codeBlockConfig()` | The parsed per-cell config (`CodeBlockConfig`) |
| `toString()` | The user's code, for display |
| `commentPrefixes()` | All comment markers the parser should recognize |
| `defaultCommentPrefix()` | The one used when the extension writes a comment |

## Anatomy of a language module

Using `src/languages/javascript.ts` as the canonical minimal example:

```ts
export class Cell implements codebook.ExecutableCell {
  innerScope: string;                        // user code, directives stripped
  executableCode: string;                    // what actually gets written to disk
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell) {
    this.config = new Config(
      workspace.getConfiguration('codebook-md.javascript'),
      notebookCell,
    );

    // per-cell execPath override wins over the global setting
    if (this.config.contentConfig.execPath) {
      this.config.execPath = this.config.contentConfig.execPath;
      this.config.execFile = path.join(
        this.config.execPath,
        path.basename(this.config.execFile),
      );
    }

    this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#");

    // wrap in output markers so runtime noise is discarded
    this.executableCode =
      `console.log("${codebook.StartOutput}");\n` +
      `${this.innerScope}\n` +
      `console.log("${codebook.EndOutput}");`;

    this.mainExecutable = new codebook.Command(
      'node', [this.config.execFile], this.config.execPath,
    );
    this.mainExecutable.addBeforeExecuteFunc(() => {
      io.writeDirAndFileSyncSafe(
        this.config.execPath, this.config.execFile, this.executableCode,
      );
    });
  }
  // ...remaining interface methods
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execFile: string;

  constructor(javascriptConfig: WorkspaceConfiguration | undefined,
              notebookCell: NotebookCell) {
    this.execPath = config.getExecPath();
    this.execFile = path.join(
      this.execPath,
      javascriptConfig?.get('execFilename') || 'codebook_md_exec.js',
    );
    this.contentConfig = new codebook.CodeBlockConfig(
      notebookCell,
      workspace.getConfiguration('codebook-md.javascript.output'),
      "//",
    );
  }
}
```

The recurring shape:

1. Build a `Config` from `workspace.getConfiguration('codebook-md.<lang>')`.
2. Let a per-cell `execPath` directive override the configured one.
3. Parse the cell into `innerScope` (code) plus commands/comments.
4. Wrap `innerScope` into `executableCode`, adding output markers if needed.
5. Construct `mainExecutable` and register a `beforeExecuteFunc` that writes the
   temp file.

## Existing modules

| File | Runtime | Notes |
| --- | --- | --- |
| `go.ts` | `go run` / `go test` | Largest module; `execType` setting picks between `execTypeRunConfig` and `execTypeTestConfig` (build tag `playground`) |
| `shell.ts` | `bash -c` | Builds a single `set -e` script from parsed commands; captures all output, no markers |
| `bash.ts` | `bash` | `execSingleLineAsCommand` runs one-line cells as a bare command |
| `javascript.ts` | `node` | Minimal reference implementation |
| `typescript.ts` | `ts-node` | Mirrors `javascript.ts` |
| `python.ts` | `python3` (`pythonCmd` setting) | |
| `sql.ts` | user-specified CLI | Driven by the `execOptions` array setting |
| `http.ts` | `curl` | Converts the block to a curl invocation; `verbose` adds `-v` |
| `unsupported.ts` | none | Fallback that renders an install hint or "not supported" |

## Multiple executables

`executables()` returns `[mainExecutable, ...postExecutables]`. Use
`postExecutables` for cleanup or follow-up steps. Note the convention that
`allowKeepOutput()` returns `false` once more than one executable is involved,
since interleaved output cannot be safely preserved:

```ts
allowKeepOutput(): boolean {
  return this.executables().length <= 1;
}
```

`shell.ts` instead keys off `commandCount`, because it collapses every parsed
command into one script.

## Binary availability

Register the runtime check in `NewExecutableCell()`, not in the `Cell`
constructor:

```ts
case languagePython.nameId: {
  const pythonCell = new python.Cell(notebookCell);
  if (io.commandNotOnPath(pythonCell.config.execCmd, "https://www.python.org/")) {
    return new unsupported.Cell(notebookCell);
  }
  return pythonCell;
}
```

Python constructs first because the command to check is configurable; the
others check before constructing.

## Shell and bash share the `codebook-md.bash` section

Shell, bash, zsh, and sh fences all normalize to `languageShellScript` and are
executed by `shell.ts`. Their settings are declared under **`codebook-md.bash`**
in `package.json` and documented under that name, so `shell.ts` reads
`codebook-md.bash` and `codebook-md.bash.output`.

There is no `codebook-md.shell` section. `shell.ts` used to read one, which
meant every documented `codebook-md.bash.output.*` setting was silently ignored
for shell cells; `src/test/languages/shell.test.ts` guards against a
regression.

## Known issues

`src/languages/bash.ts` is **dead code** — `NewExecutableCell()` contains no
case that constructs it, so every shell/bash cell is handled by `shell.ts`.

As a consequence, `execSingleLineAsCommand` does nothing. It is declared in
`package.json`, documented, and exposed in the cell config modal through
`getLanguageConfigOptions()` in `src/cellConfig.ts`, but the only code that
reads it lives in the unreachable `bash.ts`. Making it work means porting that
single-line branch into `shell.ts` — a behavior change for one-line cells, so
it should be a deliberate decision rather than a drive-by fix.

## Related documents

- [architecture.md](architecture.md) — dispatch, output markers, `Command`
- [configuration.md](configuration.md) — settings and per-cell directives
- Skill: [add-language-support](../skills/add-language-support/SKILL.md)
