# AGENTS.md — `src/`

Extension source. See the root [AGENTS.md](../AGENTS.md) for project-wide rules.

## Files at this level

| File | Responsibility |
| --- | --- |
| `extension.ts` | `activate()` / `deactivate()`, command registration, chat participant, webview provider registration |
| `kernel.ts` | Notebook controller — executes cells, streams stdout/stderr into cell output |
| `codebook.ts` | Core types and the language registry. `ExecutableCell`, `Executable`, `Command`, `CodeBlockConfig`, `OutputConfig`, `Language`, `NewExecutableCell()`, `StartOutput`/`EndOutput` |
| `config.ts` | Settings access and path resolution (`getFullPath`, `getExecPath`, `getWorkspaceFolder`, `getWorkspaceFolderFor`) |
| `cellConfig.ts` | Per-notebook/per-cell config persistence and execution history |
| `io.ts` | Safe process spawning, filesystem helpers, merged environment variables |
| `fmt.ts` | Small formatting helpers |
| `folders.ts` | `FolderGroup` system backing the My Notebooks view |
| `relatedDocs.ts` | Builds the dynamic folder group for the open file: inclusions, agent doc discovery, symlink de-duplication, scan cache |
| `docTypes.ts` | Markdown doc types (icon, label), path classification, and the catalog of agent doc locations |
| `docMeta.ts` | Cached per-file metadata: type, front matter name/description, row label and hover text |
| `frontMatterFields.ts` | Front matter readers shared with the notebook renderer bundle (no `vscode` or Node imports) |
| `glob.ts` | Small glob matcher for inclusion patterns and scoped rules |
| `docScope.ts` | A rule's scope: reads `applyTo` / `paths` / `globs` / `fileMatchPattern`, works out the folders they are about, and tests a file against them |
| `dirEntries.ts` | Reads one folder for the scanners (markdown, other files, sub-folders; exclusions; symlinks), blocking and non-blocking |
| `aiDocs.ts` | Finds every agent doc in a workspace folder for the AI Docs view, non-blocking, and decides which docs apply to a file |
| `docHealth.ts` | Health checks for agent docs: skill front matter, broken links, dead scope patterns, copied skills |
| `newSkill.ts` | The New Skill command: name and description checks, `SKILL.md` content, where the skill goes |
| `sideBarSettings.ts` | What the side bar's settings UI reads and writes: the list of settings it owns, their workspace/user/default values, and the options and order of folder groups in `codebook-md.json`. Checks every value before writing |
| `createNotebook.ts` | Notebook creation commands |
| `prompt.ts` | Chat/prompt construction |
| `taskListToggle.ts` | Applies task list checkbox clicks from the notebook renderer to the cell source |

Subdirectories: `languages/`, `notebookRenderer/`, `webview/`, `test/`, `types/`, `templating/` —
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
