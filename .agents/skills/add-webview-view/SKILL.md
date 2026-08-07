---
name: add-webview-view
description: Add a new webview-based sidebar view to the CodebookMD activity bar, following the two-file provider + template pattern. Use when asked to add a panel, sidebar view, or webview UI to the extension.
---

# Add a Webview View

Every webview in this extension is **two files**: a provider and an HTML
template. Follow the pattern in `src/webview/documentationView.ts` — it is the
smallest complete example.

## 1. Create the provider

`src/webview/myPanelView.ts`:

```ts
import {
  WebviewView, WebviewViewProvider, ExtensionContext, Uri, Disposable,
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MyPanelViewProvider implements WebviewViewProvider, Disposable {
  public static readonly viewType = 'codebook-md-my-panel-view';

  private _view?: WebviewView;
  private _disposables: Disposable[] = [];

  constructor(private readonly _extensionContext: ExtensionContext) { }

  dispose() {
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  public resolveWebviewView(webviewView: WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.file(path.join(this._extensionContext.extensionPath, 'media')),
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist')),
      ],
    };

    this._updateWebview();

    this._disposables.push(
      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case 'doSomething':
            // validate the payload before acting on it
            break;
        }
      }),
    );
  }

  private _updateWebview() {
    if (!this._view) { return; }
    this._view.webview.html = this._getWebviewContent();
  }

  private _getWebviewContent(): string {
    const templatePath = path.join(
      this._extensionContext.extensionPath, 'dist', 'templates', 'myPanel.html');
    return fs.readFileSync(templatePath, 'utf8');
  }
}
```

Note the template is read from **`dist/templates/`**, not `src/` — webpack
copies templates into the bundle (step 5). The provider takes the
`ExtensionContext`, not a bare `Uri`.

## 2. Create the template

`src/webview/templates/myPanel.html` — self-contained HTML, CSS, and JS. No
external assets. Use VS Code theme variables:

```html
<style>
  body {
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
  }
</style>
<script>
  const vscode = acquireVsCodeApi();
  function doSomething() {
    vscode.postMessage({ command: 'doSomething' });
  }
</script>
```

Never hard-code colors — the view must work in light, dark, and high-contrast
themes.

Escape anything user-supplied that you interpolate into the markup. File and
folder display names come from user configuration.

## 3. Declare the view

In `package.json` `contributes.views`, under `codebook-md-activitybar`:

```jsonc
{
  "id": "codebook-md-my-panel-view",
  "name": "My Panel",
  "icon": "extension/src/img/icon_logo_v1.svg",
  "type": "webview"
}
```

The `id` must match `MyPanelViewProvider.viewType` exactly.

## 4. Register in `extension.ts`

Inside `activate()`:

```ts
const myPanelProvider = new MyPanelViewProvider(context);
context.subscriptions.push(
  window.registerWebviewViewProvider(
    MyPanelViewProvider.viewType, myPanelProvider),
  myPanelProvider,
);
```

## 5. Confirm the template reaches the bundle

Templates are read from disk at runtime, so they must be present in the
packaged extension. `webpack.config.js` uses `copy-webpack-plugin`:

```js
new CopyPlugin({
  patterns: [{ from: 'src/webview/templates/*.html', to: 'templates/[name][ext]' }],
})
```

Any `.html` file placed in `src/webview/templates/` is copied to
`dist/templates/` automatically — no webpack change is needed. This is why the
provider reads from `dist/templates/`.

## 6. Test and document

- Add `src/test/webview/myPanelView.test.ts`, mirroring
  `src/test/webview/configModal.test.ts`. Message-handler dispatch and HTML
  generation are the parts worth covering.
- Document the view in `README.md` and in
  `src/webview/templates/documentation.html` (including its index).
- Add a `CHANGELOG.md` entry.

## Verify

```bash
npm run compile && npm run lint && npm test
```

In the Extension Development Host, open the Codebook activity bar and confirm
the view renders, responds to messages, and looks right in both a light and a
dark theme.

Commit as `feat(webview): add <name> view`.

## Related

- [`.agents/references/webviews.md`](../../references/webviews.md)
