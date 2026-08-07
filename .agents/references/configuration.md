# Configuration System

## The hierarchy

Four layers, each narrowing the one above:

1. **VS Code settings** — declared in `package.json`
   `contributes.configuration`, read via `workspace.getConfiguration(...)`.
2. **`CodeBlockConfig`** — per-cell configuration parsed out of the code block
   itself (`src/codebook.ts`).
3. **`OutputConfig`** — controls how execution output is displayed.
4. **Language-specific config objects** — the `Config` class in each
   `src/languages/*.ts` module.

## Declaring a setting

**Settings must be flat properties.** A setting nested inside an object does
not appear in the VS Code Settings UI:

```jsonc
// Correct — appears in the Settings UI
"codebook-md.frontMatter.showInNotebook": {
  "type": "boolean",
  "description": "Show YAML Front Matter as the first cell in notebooks",
  "scope": "window"
}

// Wrong — invisible in the Settings UI
"codebook-md.frontMatter": {
  "type": "object",
  "properties": { "showInNotebook": { "type": "boolean" } }
}
```

The existing per-language blocks (`codebook-md.go`, `codebook-md.python`, …)
are declared as objects and predate this rule. Leave them be; use the flat form
for anything new that a user should be able to set from the UI.

## Current settings

Top level:

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `codebook-md.rootPath` | string | | Root for resolving relative paths |
| `codebook-md.notebookConfigPath` | string | | Location of per-notebook config |
| `codebook-md.execPath` | string | `./codebook-md/` | Where temp exec files are written |
| `codebook-md.permalinkPrefix` | string | | Prefix for generated permalinks |
| `codebook-md.frontMatter.showInNotebook` | boolean | | Show YAML front matter as the first cell |

Output (`codebook-md.output.*`, also mirrored per-language):

| Key | Default | Purpose |
| --- | --- | --- |
| `showExecutableCodeInOutput` | `true` | Prepend the executed code to the output |
| `replaceOutputCell` | `true` | Replace rather than append output |
| `showTimestamp` | `true` | Timestamp the output |
| `timestampTimezone` | | Timezone for the timestamp |

Execution history (`codebook-md.executionHistory.*`): `enabled`, `historyLimit`.

Dynamic folder group (`codebook-md.dynamicFolderGroup.*`): `enabled`, `name`,
`description`, `subFolderInclusions`, `exclusions`.

Per-language objects: `codebook-md.go`, `.bash`, `.javascript`, `.typescript`,
`.sql`, `.python`, `.http` — each with its own exec options plus a nested
`output` block.

## Per-cell directives

`CodeBlockConfig` parses each line of a cell. A line beginning with a comment
prefix followed by `[>]` is a **command**; other comment lines are **comments**;
everything else is `innerScope`.

```bash
# [>].output.showTimestamp(true)
# [>].execPath(./scratch)
echo "this line is innerScope"
```

The recognized prefixes come from the language's `commentPrefixes()`, so the
same directive is written `// [>]...` in JavaScript and `# [>]...` in shell.

`CodeBlockConfig` fields: `notebookCell`, `languageId`, `commands`, `comments`,
`innerScope`, `cellConfig`, `execPath`, `outputConfig`. It handles an
`undefined` cell by constructing an empty instance — useful in tests.

Persisted per-cell config lives alongside the notebook and is managed by
`src/cellConfig.ts` (`loadNotebookConfig`, `saveNotebookConfig`,
`saveCellConfig`, `updateNotebookConfigIndices`, `getNotebookConfigPath`).

## Path resolution

Always go through `src/config.ts`:

| Function | Use |
| --- | --- |
| `getExecPath()` | Directory for generated exec files |
| `fullExecPath(execPath, currentFile, workspacePath)` | Resolve an exec path against the current file |
| `getFullPath(filePath, workspacePath)` | Resolve any workspace-relative path |
| `getWorkspaceFolder()` | Current workspace root |
| `getCodebookConfigFilePath()` | Path to `.vscode/codebook-md.json` |
| `getDynamicFolderGroupConfig()` / `isDynamicFolderGroupEnabled()` | Dynamic folder group settings |

## Environment variables

Cells inherit `io.getMergedEnvironmentVariables()`: `process.env` overlaid with
`terminal.integrated.env.<osx|windows|linux>` from VS Code settings, with
`${workspaceFolder}`, `${workspaceFolderBasename}`, and `${pathSeparator}`
substituted. Use it instead of `process.env` so cells see the same environment
as the integrated terminal.

## Notebook organization config

`.vscode/codebook-md.json` holds user-defined virtual folders. Folders carry
`name`, `folderPath` (dot-separated hierarchy), optional `icon`, optional
`hide`, and `files`; each file carries `name` and `path`.

`src/folders.ts` implements the `FolderGroup` system:

- **Static folders** from `.vscode/codebook-md.json`
- **Dynamic folder groups** generated from the currently focused file
- `FolderGroupEntity` for move/delete operations
- Entity ids encode the group/folder/file hierarchy for webview round-trips
- The webview sends **1-based** `groupIndex` values; convert to 0-based before
  indexing arrays
- Call `refreshNotebooksView()` after any structural change

## Execution history

`src/cellConfig.ts` plus `src/types/executionHistory.ts`:
`addHistoryEntry`, `getHistoryForCell`, `getAllHistory`,
`clearHistoryForCell`, `deleteHistoryEntry`, `clearAllHistory`,
`getExecutionHistoryConfig`. History is surfaced in the config modal webview.

## Related documents

- [architecture.md](architecture.md)
- [language-support.md](language-support.md)
- Skill: [add-configuration-setting](../skills/add-configuration-setting/SKILL.md)
