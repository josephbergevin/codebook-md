import {
  WebviewView,
  WebviewViewProvider,
  ExtensionContext,
  Uri,
  Disposable
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Provider for the Documentation webview view.
 */
export class DocumentationViewProvider implements WebviewViewProvider, Disposable {
  public static readonly viewType = 'codebook-md-documentation-view';
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
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist'))
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
    // Read the HTML template
    const templatePath = path.join(this._extensionContext.extensionPath, 'src/webview/templates/documentation.html');
    const htmlContent = fs.readFileSync(templatePath, 'utf8');

    return htmlContent;
  }
}
