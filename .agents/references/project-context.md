# Project Context

## Overview

CodebookMD is a VS Code extension that brings Jupyter-like notebook
functionality to markdown files. Fenced code blocks in a `.md`/`.markdown` file
become executable cells; the extension runs them in the user's local
environment and renders the captured output back into the notebook.

The extension is written in TypeScript and follows a modular architecture. It
uses webviews for interactive sidebar content and the VS Code notebook API for
the notebook surface itself.

## Feature set

- **Executable code blocks** — Go, Shell/Bash, JavaScript, TypeScript, Python,
  SQL, and HTTP. Unsupported languages fall through to a cell that renders an
  explanatory message rather than failing.
- **Notebook organization** — a "My Notebooks" tree in the activity bar with
  user-defined virtual folders (`.vscode/codebook-md.json`) plus a dynamic
  folder group generated from the currently focused file.
- **Per-cell configuration** — comment directives inside a code block
  (`# [>].output.showTimestamp(true)`) and a config modal webview.
- **Execution history** — optional per-cell history of prior runs.
- **Chat participant** — `@codebook` in VS Code chat, plus
  `chatWithCell` / `chatWithSection` / `chatWithNotebook` commands.
- **Markdown ecosystem integration** — contributes to VS Code's markdown
  preview pipeline via `contributes.markdown`.

## Registered surface

Declared in `package.json` `contributes`:

- `notebooks` — notebook type `codebook-md`, selector `*.{md,markdown}`,
  priority `default`
- `chatParticipants` — id `codebook-md`, invoked as `@codebook`, sticky
- `viewsContainers` / `views` — activity bar container `codebook-md-activitybar`
  holding the Welcome, My Notebooks, and Documentation webviews
- `commands` — 20 commands, all prefixed `codebook-md.`
- `configuration` — the `codebook-md.*` settings tree
- `languages`, `markdown`, `menus`

Activation events: `onLanguage:markdown`, `onStartupFinished`.

## Core components

1. **Kernel** (`src/kernel.ts`) — the notebook controller. Receives cells to
   execute, builds an `ExecutableCell`, spawns the process, and streams
   stdout/stderr back into the cell output.
2. **Language implementations** (`src/languages/`) — each language exports a
   `Cell` class implementing `ExecutableCell` and a `Config` class that reads
   the language's VS Code settings.
3. **Command execution** (`src/codebook.ts`) — the `Command` class wraps
   `child_process.spawn`, with `beforeExecuteFuncs` hooks for setup (typically
   writing the temp source file) and `outputTransformers` for post-processing.
4. **Webview providers** (`src/webview/`) — Welcome, Documentation, My
   Notebooks, and the cell configuration modal.
5. **Configuration system** — layered: VS Code settings → `CodeBlockConfig`
   (per-cell) → `OutputConfig` → language-specific config objects.

## Data flow

```
notebook cell
  → kernel.executeCell
  → codebook.NewExecutableCell(cell)          # dispatch on languageId
  → languages/<lang>.Cell                     # parse content, build Command
  → Command.execute()                         # beforeExecuteFuncs, then spawn
  → stdout/stderr streams
  → output captured between StartOutput / EndOutput markers
  → rendered into the cell
```

Configuration flow:

```
VS Code settings (package.json contributes.configuration)
  → workspace.getConfiguration('codebook-md.<lang>')
  → languages/<lang>.Config
  → codebook.CodeBlockConfig (per-cell comment directives)
  → codebook.OutputConfig
```

File organization flow:

```
.vscode/codebook-md.json → FolderGroup system → notebooksView webview
```

## Related documents

- [architecture.md](architecture.md) — the pieces in detail
- [language-support.md](language-support.md) — the `ExecutableCell` contract
- [configuration.md](configuration.md) — the settings hierarchy
