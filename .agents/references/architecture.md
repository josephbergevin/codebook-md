# Architecture

## Execution pipeline

`src/kernel.ts` owns the `NotebookController`. For each cell it executes:

1. Build an executable via `codebook.NewExecutableCell(notebookCell)`.
2. Call `execute()`, which runs any registered `beforeExecuteFuncs` (usually
   writing a temp source file) and then spawns the process.
3. Attach `stdout`/`stderr` handlers that stream output into the cell in real
   time.
4. Trim the stream to the region between the `StartOutput` and `EndOutput`
   markers when the language uses them.

### Output markers

```ts
export const StartOutput = `!!output-start-cell`;
export const EndOutput   = `!!output-end-cell`;
```

Languages that emit surrounding noise (Go's build output, Node's module
chatter) wrap the user's code so it prints these markers, and everything
outside the markers is discarded. Shell cells capture all output and do not
need them.

When you add a language, decide explicitly whether it needs markers. If the
runtime can print anything before or after the user's code, it does.

## Language registry

`src/codebook.ts` defines a `Language` value object and a registry:

```ts
export class Language {
  displayName: string;
  nameId: string;       // displayName.toLowerCase()
  aliases: string[];
  isExecutable: boolean;
}
```

Registered languages:

| Constant | `nameId` | Aliases | Executable |
| --- | --- | --- | --- |
| `languageGo` | `go` | `golang` | yes |
| `languageJavaScript` | `javascript` | `js` | yes |
| `languagePython` | `python` | `py` | yes |
| `languageShellScript` | `shellscript` | `sh`, `shell-script`, `shell`, `shellscript`, `zsh`, `bash` | yes |
| `languageSQL` | `sql` | `mysql`, `postgres` | yes |
| `languageTypeScript` | `typescript` | `ts` | yes |
| `languageHttp` | `http` | — | yes |
| `languageRust` | `rust` | — | no |
| `languageMermaid` | `mermaid` | `mmd` | no |

`languagesByAbbrev` maps every display name and alias (lowercased) to its
`Language`, so `findLanguageId()` can normalize whatever fence tag the user
typed.

## Dispatch

`NewExecutableCell()` switches on `notebookCell.document.languageId`. Before
returning a language `Cell`, it checks that the required binary is on `PATH`
via `io.commandNotOnPath(cmd, installUrl)` — if not, it returns
`unsupported.Cell`, which renders an install hint instead of failing opaquely.

Any unrecognized `languageId` also falls through to `unsupported.Cell`.

## Command execution

`codebook.Command` implements `Executable`:

```ts
export interface Executable {
  execute(): ChildProcessWithoutNullStreams;
  toString(): string;
  jsonStringify(): string;
  beforeExecuteFuncs?: Array<() => void>;
}
```

Notable members:

- `addBeforeExecuteFunc(fn)` — setup hooks, run in order before `spawn`
- `addOutputTransformer(fn)` — rewrite captured output before display
- `setCommandToDisplay(str)` — show the user's original code rather than the
  generated wrapper
- `cwd` — working directory; fall back to `config.getExecPath()` when it does
  not exist

Process spawning goes through `io.spawnSafe` / `io.spawnSyncSafe` /
`io.execSyncSafe`, which add retry and error handling. `io.spawnSafe` retries
up to three times.

## Environment variables

`io.getMergedEnvironmentVariables()` clones `process.env` and overlays
`terminal.integrated.env.<platform>` from VS Code settings, where `<platform>`
is `osx`, `windows`, or `linux` derived from `process.platform`.

Values support VS Code variable substitution for:

- `${workspaceFolder}`
- `${workspaceFolderBasename}`
- `${pathSeparator}`

Use this rather than raw `process.env` for anything a spawned cell will see, so
users get the same environment their integrated terminal has.

## Command registration

- Register in `activate()` in `src/extension.ts` **and** in `package.json`
  `contributes.commands`.
- Prefix every command id with `codebook-md.`.
- Push the disposable onto `context.subscriptions`.
- Handle errors inside the handler and give the user feedback
  (`window.showErrorMessage`) rather than throwing into the void.

## Chat participant

- Id `codebook-md`, invoked as `@codebook`, declared in
  `package.json` `contributes.chatParticipants` with `isSticky: true`.
- Implemented against VS Code's `ChatRequestHandler` interface and registered
  in `activate()`.
- Answers questions about creating and managing notebooks, executing code,
  configuring the extension, and general usage; returns follow-up suggestions
  keyed to the kind of question asked.
- Set an icon path when registering.
- Companion commands `codebook-md.chatWithCell`, `.chatWithSection`, and
  `.chatWithNotebook` seed a chat with the relevant notebook content.

## VS Code integration principles

- Reach for built-in VS Code APIs before adding a dependency; the runtime
  dependency list is deliberately tiny (`markdown-it` only).
- Honor extension lifecycle events; clean up in `deactivate()` and `dispose()`.
- Use native UI components (quick picks, input boxes, tree/webview views) over
  bespoke HTML where a native affordance exists.
- Use VS Code CSS theme variables in webview HTML so views follow the user's
  theme.

## Related documents

- [language-support.md](language-support.md)
- [configuration.md](configuration.md)
- [webviews.md](webviews.md)
