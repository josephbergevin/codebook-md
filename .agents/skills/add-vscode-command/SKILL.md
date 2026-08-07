---
name: add-vscode-command
description: Add a new VS Code command to CodebookMD end to end — package.json contribution, registration in extension.ts, menus, and docs. Use when asked to add a command, palette entry, context-menu action, or notebook cell toolbar button.
---

# Add a VS Code Command

A command needs **two** registrations. Missing either one produces a command
that either does nothing or is invisible.

## 1. Declare in `package.json`

Add to `contributes.commands`:

```jsonc
{
  "command": "codebook-md.doTheThing",
  "title": "Codebook: Do The Thing",
  "category": "Codebook"
}
```

Conventions in this repo:

- Command id is always prefixed `codebook-md.`.
- Titles for palette-visible commands are prefixed `Codebook: `. Commands that
  only appear in a context menu use a bare title (e.g. `Add Sub-folder`).
- Use `icon` with a `$(codicon)` reference for toolbar buttons.

## 2. Register in `extension.ts`

Inside `activate()`:

```ts
context.subscriptions.push(
  commands.registerCommand('codebook-md.doTheThing', async (arg?: SomeType) => {
    try {
      // ...
    } catch (error) {
      console.error('doTheThing failed:', error);
      window.showErrorMessage(`Codebook: could not do the thing — ${error}`);
    }
  }),
);
```

Requirements:

- Push the disposable onto `context.subscriptions`.
- Wrap the body in `try`/`catch` and surface a useful message to the user.
- Resolve any path through `config.getFullPath()` or `config.getExecPath()`.
- Call `refreshNotebooksView()` after any change to folder structure.

## 3. Add menu placement (if needed)

`contributes.menus` controls where the command appears. Common targets in this
extension:

| Menu | Use |
| --- | --- |
| `commandPalette` | Add a `when` clause to hide it when irrelevant |
| `notebook/cell/title` | Cell toolbar buttons |
| `editor/title` | Editor tab bar |
| `view/item/context` | Tree/webview item context menus |

```jsonc
"notebook/cell/title": [
  {
    "command": "codebook-md.doTheThing",
    "when": "notebookType == codebook-md",
    "group": "inline"
  }
]
```

To keep a command out of the palette entirely:

```jsonc
"commandPalette": [
  { "command": "codebook-md.doTheThing", "when": "false" }
]
```

## 4. Wire the webview path (if applicable)

If the command is triggered from a sidebar webview, the webview posts a message
and the provider dispatches to `commands.executeCommand(...)`. Remember that the
webview sends **1-based** `groupIndex` values — convert to 0-based before
indexing arrays.

## 5. Document

- `README.md` if the command is user-facing.
- `src/webview/templates/documentation.html`, including its index.
- `CHANGELOG.md`.

## Verify

```bash
npm run compile && npm run lint && npm test
```

In the Extension Development Host, confirm the command appears where you
expect, runs, and reports errors legibly when given bad input.

Commit as `feat(<scope>): add <command> command`.

## Existing commands

For reference, the extension currently registers 20 commands including
`createNewNotebook`, `createNotebookFromSelection`, `openFileAtLine`,
`openMarkdownPreview`, `addCurrentFileToFavorites`, `addFolderToFolderGroup`,
`toggleFrontMatter`, `openNotebookConfig`, `reopenWithTextEditor`, and the
`chatWithCell` / `chatWithSection` / `chatWithNotebook` trio.
