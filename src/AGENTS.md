# AGENTS.md — `src/`

Extension source. See the root [AGENTS.md](../AGENTS.md) for project-wide rules.

## Files at this level

| File | Responsibility |
| --- | --- |
| `extension.ts` | `activate()` / `deactivate()`, command registration, chat participant, webview provider registration |
| `kernel.ts` | Notebook controller — executes cells, streams stdout/stderr into cell output |
| `codebook.ts` | Core types and the language registry. `ExecutableCell`, `Executable`, `Command`, `CodeBlockConfig`, `OutputConfig`, `Language`, `NewExecutableCell()`, `StartOutput`/`EndOutput` |
| `config.ts` | Settings access and path resolution (`getFullPath`, `getExecPath`, `getWorkspaceFolder`) |
| `cellConfig.ts` | Per-notebook/per-cell config persistence and execution history |
| `io.ts` | Safe process spawning, filesystem helpers, merged environment variables |
| `fmt.ts` | Small formatting helpers |
| `folders.ts` | `FolderGroup` system backing the My Notebooks view |
| `createNotebook.ts` | Notebook creation commands |
| `prompt.ts` | Chat/prompt construction |
| `markdownContributions.ts`, `markdownRenderer.ts` | VS Code markdown preview integration |

Subdirectories: `languages/`, `webview/`, `test/`, `types/`, `templating/` —
each with its own `AGENTS.md` where it has one.

## Rules for this directory

- **Never hand-roll path resolution.** Use `config.getFullPath()` and
  `config.getExecPath()`.
- **Never call `child_process` directly.** Use `io.spawnSafe`,
  `io.spawnSyncSafe`, or `io.execSyncSafe` — they add retries and error
  handling.
- **Never read `process.env` for cell execution.** Use
  `io.getMergedEnvironmentVariables()` so cells see the same environment as the
  integrated terminal, including `terminal.integrated.env.*` overrides and
  `${workspaceFolder}` substitution.
- **Push every disposable onto `context.subscriptions`.**
- A new command needs both a `registerCommand` call in `extension.ts` and an
  entry in `package.json` `contributes.commands`.

## Adding to `codebook.ts`

It is already large (~1200 lines). New language-specific behavior belongs in
`languages/`, new config behavior in `config.ts` or `cellConfig.ts`. Only truly
shared types and the language registry belong here.

## Tests

Mirror the structure into `src/test/`. `src/kernel.ts` and `src/extension.ts`
currently have little or no coverage; adding some alongside a change there is
welcome.

## References

- [architecture.md](../.agents/references/architecture.md)
- [coding-standards.md](../.agents/references/coding-standards.md)
- [configuration.md](../.agents/references/configuration.md)
