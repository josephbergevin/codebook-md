import * as vscode from 'vscode';
import {
  WebviewView,
  WebviewViewProvider,
  ExtensionContext,
  Uri,
  Disposable,
  Webview
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface WebviewMessage {
  command: string;
  view?: 'documentation' | 'notebooks';
}

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
    this._setWebviewMessageListener(webviewView.webview);
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

    // Read the HTML template
    const templatePath = path.join(this._extensionContext.extensionPath, 'src/webview/templates/welcome.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholder with actual logo URI
    htmlContent = htmlContent.replace('{{logoUri}}', logoUri?.toString() || '');

    return htmlContent;
  }

  private _setWebviewMessageListener(webview: Webview) {
    webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.command) {
          case 'openWebview':
            if (message.view === 'documentation') {
              await vscode.commands.executeCommand('codebook-md.openDocumentation');
            } else if (message.view === 'notebooks') {
              await vscode.commands.executeCommand('codebook-md.openNotebooks');
            }
            return;
        }
      },
      undefined,
      this._disposables
    );
  }
}
