# Webviews

All sidebar UI in this extension is webview-based. `package.json` declares the
activity bar container `codebook-md-activitybar` holding three views, each
`"type": "webview"`:

| View id | Provider | Template |
| --- | --- | --- |
| `codebook-md-welcome-view` | `src/webview/welcomeView.ts` | `templates/welcome.html` |
| `codebook-md-notebooks-view` | `src/webview/notebooksView.ts` | `templates/notebooks.html` |
| `codebook-md-documentation-view` | `src/webview/documentationView.ts` | `templates/documentation.html` |

`src/webview/configModal.ts` is the per-cell configuration modal. It is by far
the largest webview module and generates its markup inline rather than from a
template file.

## The two-file provider pattern

A webview is **two files**:

1. **A provider** at `src/webview/<name>View.ts`
   - implements `WebviewViewProvider`
   - implements `resolveWebviewView()` to supply the content
   - loads the HTML template and wires up message handling
   - implements `dispose()` for cleanup
2. **A template** at `src/webview/templates/<name>.html`
   - self-contained: all HTML, CSS, and JavaScript in the one file
   - no external asset references

Registration happens in `activate()` in `src/extension.ts`; push the resulting
disposable onto `context.subscriptions`.

## Message passing

Communication is bidirectional over the webview messaging API:

- extension → webview: `webview.postMessage({ command, ...payload })`
- webview → extension: `vscode.postMessage(...)` handled by
  `webview.onDidReceiveMessage(...)`

Guidelines:

- Validate every inbound message; a webview is untrusted input.
- Dispatch on an explicit `command` field rather than inferring from shape.
- After any structural change to folders or files, call
  `refreshNotebooksView()` so the tree re-renders.

## Index conventions

The notebooks webview sends **1-based** `groupIndex` values. Convert to 0-based
before indexing arrays on the extension side. Entity ids encode the
group/folder/file hierarchy so the webview can address a node without holding a
reference.

## Theming

Use VS Code's CSS theme variables so views follow the user's theme:

```css
body {
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
}
button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
```

Never hard-code colors.

## Security

- Escape any content interpolated into HTML — file names and folder display
  names are user-supplied.
- Validate file paths and URLs before acting on them.
- Prefer VS Code native affordances (quick pick, input box) when a full webview
  is not needed.

## Documentation view

`src/webview/templates/documentation.html` is the in-extension user
documentation. It has its own index near the top. When you ship a user-facing
feature, add a section **and** an index entry — an orphaned section is
effectively invisible.

## Related documents

- [architecture.md](architecture.md)
- [configuration.md](configuration.md) — the `FolderGroup` system the notebooks
  view renders
- Skill: [add-webview-view](../skills/add-webview-view/SKILL.md)
