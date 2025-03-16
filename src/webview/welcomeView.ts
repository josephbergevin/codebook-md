import {
  WebviewView,
  WebviewViewProvider,
  ExtensionContext,
  Uri,
  Disposable
} from 'vscode';
import * as path from 'path';

/**
 * Provider for the Welcome webview view.
 */
export class WelcomeViewProvider implements WebviewViewProvider, Disposable {
  public static readonly viewType = 'codebook-md-welcome-view';
  private _view?: WebviewView;
  private _disposables: Disposable[] = [];

  constructor(private readonly _extensionContext: ExtensionContext) { }

  dispose() {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  public resolveWebviewView(
    webviewView: WebviewView
  ) {
    this._view = webviewView;

    // Set options for the webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.file(path.join(this._extensionContext.extensionPath, 'media')),
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist')),
        Uri.file(path.join(this._extensionContext.extensionPath, 'extension/src/img'))
      ]
    };

    // Set the HTML content
    this._updateWebview();
  }

  /**
   * Update the webview content
   */
  private _updateWebview() {
    if (!this._view) {
      return;
    }

    this._view.webview.html = this._getWebviewContent();
  }

  /**
   * Get the webview HTML content
   */
  private _getWebviewContent() {
    // Get the path to the logo image
    const logoPath = path.join(this._extensionContext.extensionPath, 'extension/src/img/logo_3_800x800.png');
    const logoUri = this._view?.webview.asWebviewUri(Uri.file(logoPath));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Codebook MD</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .container {
          padding: 10px;
          width: 100%;
          box-sizing: border-box;
        }
        .logo-container {
          padding-bottom: 10px;
          max-width: 100%;
          text-align: center;
        }
        .logo {
          max-width: 128px;
          height: auto;
        }
        h1, h4, h5 {
          text-align: center;
          margin: 0.8em 0 0.5em 0;
        }
        h1 {
          font-size: 1.5em;
        }
        h4 {
          font-size: 1.2em;
          margin-top: 1.5em;
        }
        h5 {
          font-size: 1.1em;
          text-align: left;
        }
        p {
          margin: 0.5em 0;
          text-align: left;
          line-height: 1.5;
        }
        ul {
          text-align: left;
          padding-left: 20px;
        }
        li {
          margin-bottom: 0.3em;
        }
        ol {
          text-align: left;
          padding-left: 20px;
        }
        .feature-list li {
          margin-bottom: 0.5em;
        }
        .instructions {
          margin-top: 1em;
          text-align: left;
        }
        .feature-highlight {
          font-weight: bold;
        }
        .code-example {
          font-family: var(--vscode-editor-font-family);
          background-color: var(--vscode-editor-background);
          padding: 2px 4px;
          border-radius: 3px;
        }
        hr {
          border: none;
          border-top: 1px solid var(--vscode-panel-border);
          margin: 1.5em 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-container">
          <img class="logo" src="${logoUri}" alt="Codebook MD Logo" />
        </div>
        <h1>Codebook MD</h1>
        <p>
          Bring your markdown to life! Execute code blocks and keep your notebooks organized.
        </p>
        
        <hr>
        
        <h4>Organizing Markdown Files with Virtual Folders</h4>
        
        <h5>Features</h5>
        <ul class="feature-list">
          <li><span class="feature-highlight">Organize <code class="code-example">.md</code> files</span> into virtual folders</li>
          <li><span class="feature-highlight">Create custom folder hierarchies</span> for easy navigation</li>
          <li><span class="feature-highlight">Add frequently used notebooks</span> to specific folders</li>
          <li><span class="feature-highlight">Rename files and folders</span> with custom display names</li>
          <li><span class="feature-highlight">Access important documents</span> with one click</li>
        </ul>
        
        <p>
          The <span class="feature-highlight">Tree View</span> feature allows you to create virtual folders to organize your markdown files.
          You can add files to these folders, making it easier to navigate and manage your workspace.
        </p>
        
        <div class="instructions">
          <h5>How to Add Virtual Folders</h5>
          <ol>
            <li>Click on the <span class="feature-highlight">New Folder</span> icon above the <span class="feature-highlight">Tree View</span>.</li>
            <li>Enter the display name of the folder.
              <ul>
                <li>Example: <code class="code-example">"Animals"</code></li>
              </ul>
            </li>
            <li>The virtual folder will be added to the top level of the <span class="feature-highlight">Tree View</span>.</li>
          </ol>
          
          <h5>How to Add Sub-Folders</h5>
          <ol>
            <li>Right-click on the folder you want to add a sub-folder to.</li>
            <li>Select <span class="feature-highlight">"Add Sub-Folder"</span> from the context menu.</li>
            <li>Enter the display name of the sub-folder.
              <ul>
                <li>Example: <code class="code-example">"Dogs"</code></li>
              </ul>
            </li>
            <li>The sub-folder will be added to the selected folder in the <span class="feature-highlight">Tree View</span>.</li>
          </ol>
          
          <h5>How to Add Files to Folders</h5>
          <ol>
            <li>Right-click on the folder you want to add a file to.</li>
            <li>Select <span class="feature-highlight">"Add File"</span> from the context menu.</li>
            <li>Enter the display name of the file.
              <ul>
                <li>Example: <code class="code-example">"Dog Breeds"</code></li>
              </ul>
            </li>
            <li>The file will be added to the selected folder in the <span class="feature-highlight">Tree View</span>.</li>
          </ol>
        </div>
      </div>
    </body>
    </html>`;
  }
}
