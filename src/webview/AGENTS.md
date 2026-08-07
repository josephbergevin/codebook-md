# AGENTS.md — `src/webview/`

Sidebar and modal UI. See
[webviews.md](../../.agents/references/webviews.md) for detail and
[add-webview-view](../../.agents/skills/add-webview-view/SKILL.md) for the
procedure.

## Files

| File | View id | Template |
| --- | --- | --- |
| `welcomeView.ts` | `codebook-md-welcome-view` | `templates/welcome.html` |
| `notebooksView.ts` | `codebook-md-notebooks-view` | `templates/notebooks.html` |
| `documentationView.ts` | `codebook-md-documentation-view` | `templates/documentation.html` |
| `configModal.ts` | — (modal panel) | generated inline |

All three views live in the `codebook-md-activitybar` container declared in
`package.json` `contributes.views`.

## The two-file pattern

1. **Provider** — `<name>View.ts`, implementing `WebviewViewProvider` and
   `Disposable`. Takes the `ExtensionContext`, implements
   `resolveWebviewView()`, reads its template, and handles messages.
2. **Template** — `templates/<name>.html`, self-contained HTML + CSS + JS.

`documentationView.ts` is the smallest complete example. `configModal.ts` is the
exception to the pattern — it generates markup inline and is ~110k, so prefer
the template approach for anything new.

## Rules for this directory

- **Templates are read from `dist/templates/`, not `src/`.**
  `webpack.config.js` copies `src/webview/templates/*.html` to
  `dist/templates/[name][ext]`. Any new `.html` file there is picked up
  automatically.
- **The provider `id` in `package.json` must match `static readonly viewType`**
  exactly.
- **Implement `dispose()`** and drain a `_disposables` array; push the provider
  itself onto `context.subscriptions`.
- **Use VS Code CSS theme variables** — `var(--vscode-foreground)`,
  `var(--vscode-editor-background)`, `var(--vscode-button-background)`. Never
  hard-code colors; views must work in light, dark, and high-contrast themes.
- **Validate every inbound message.** Dispatch on an explicit `message.command`
  field and check the payload before acting.
- **Escape user-supplied content** interpolated into HTML. Folder and file
  display names come from `.vscode/codebook-md.json`.
- **`groupIndex` from the webview is 1-based.** Convert to 0-based before
  indexing arrays.
- **Call `refreshNotebooksView()`** after any structural change to folders or
  files.

## Documentation view

`templates/documentation.html` is the in-extension user documentation and has
its own index near the top. When adding a user-facing feature, add both the
section and its index entry — a section missing from the index is effectively
invisible.
