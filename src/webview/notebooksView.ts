import {
  WebviewView,
  WebviewViewProvider,
  ExtensionContext,
  Uri,
  Disposable,
  commands,
  workspace
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as config from '../config';

/**
 * Provider for the My Notebooks webview view.
 */
export class NotebooksViewProvider implements WebviewViewProvider, Disposable {
  public static readonly viewType = 'codebook-md-notebooks-view';
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

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.command) {
        case 'openFile':
          if (data.filePath) {
            const uri = Uri.file(data.filePath);
            commands.executeCommand('vscode.openWith', uri, 'codebook-md');
          }
          break;
        case 'refresh':
          this._updateWebview();
          break;
      }
    });

    // Update webview when tree view data changes
    this._disposables.push(
      workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('codebook-md.treeView.folders')) {
          this._updateWebview();
        }
      })
    );

    // Watch for changes in .vscode/settings.json
    const settingsWatcher = workspace.createFileSystemWatcher('**/.vscode/settings.json');
    settingsWatcher.onDidChange(() => this._updateWebview());
    settingsWatcher.onDidCreate(() => this._updateWebview());
    settingsWatcher.onDidDelete(() => this._updateWebview());
    this._disposables.push(settingsWatcher);
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
    // Get the tree view folders data
    const treeData = config.getTreeViewFolders();

    // Build HTML for the folders and files
    let foldersHtml = '';
    treeData.forEach(folder => {
      foldersHtml += this._buildFolderHtml(folder);
    });

    if (!foldersHtml) {
      foldersHtml = '<p class="no-data">No notebooks found. Add folders and files in the Tree View above.</p>';
    }

    // const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';

    // Full HTML with CSS and JavaScript
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>My Notebooks</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          padding: 0;
          margin: 0;
        }
        .container {
          padding: 10px;
        }
        .folder {
          margin-bottom: 10px;
        }
        .folder-header {
          display: flex;
          align-items: center;
          font-weight: bold;
          cursor: pointer;
          padding: 5px;
          border-radius: 4px;
        }
        .folder-header:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .folder-name {
          margin-left: 5px;
        }
        .folder-icon {
          width: 16px;
          height: 16px;
          display: inline-block;
          background-size: contain;
        }
        .folder-content {
          padding-left: 20px;
        }
        .file {
          display: flex;
          align-items: center;
          padding: 3px 5px;
          margin: 2px 0;
          cursor: pointer;
          border-radius: 4px;
        }
        .file:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .file-icon {
          width: 16px;
          height: 16px;
          display: inline-block;
          background-size: contain;
        }
        .file-name {
          margin-left: 5px;
        }
        .hidden {
          display: none;
        }
        .subfolder {
          margin-left: 15px;
        }
        .no-data {
          font-style: italic;
          opacity: 0.8;
          margin: 10px 0;
        }
        .refresh-button {
          position: absolute;
          top: 5px;
          right: 5px;
          cursor: pointer;
          padding: 2px;
          border-radius: 3px;
        }
        .refresh-button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="refresh-button" title="Refresh" onclick="refresh()">
          <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c.146.689.55 1.31 1.125 1.723.25.18.5.275.75.275.2 0 .4-.05.6-.15l.526-.302.272.272a.95.95 0 0 0 .65.284.95.95 0 0 0 .668-.284c.35-.349.4-.7.4-1.087 0-.38-.075-.75-.3-1.147l-.225-.392-.048-.83c-.03-.595-.295-1.12-.738-1.5-.374-.318-.814-.47-1.3-.5zm.948 5.316a.456.456 0 0 1-.318.137.456.456 0 0 1-.318-.137l-.413-.414-1.118.655c-.099.05-.199.075-.299.075a.493.493 0 0 1-.375-.139c-.275-.199-.508-.553-.61-1.022l-.069-.345-.13-.145c.15-1.142.564-1.931.831-2.274l.255-.195-.592-.762c-.202.335-.458.848-.609 1.631-.15.775-.076 1.677.225 2.573.148.436.42.853.804 1.142.381.287.818.429 1.307.429.425 0 .852-.116 1.239-.347l.546-.32.405.405c.084.084.192.125.3.125a.43.43 0 0 0 .3-.125A.442.442 0 0 0 15 11.667c0-.188-.042-.362-.125-.512l-.345-.609.162-.203c.139-.174.262-.373.369-.597.109-.224.164-.457.164-.7 0-.43-.077-.824-.249-1.155-.15-.315-.434-.672-.813-.965-.382-.292-.825-.424-1.327-.424-.433 0-.856.119-1.236.354l-.533.315-.583-.754c.241-.18.516-.331.822-.453.302-.119.615-.18.933-.18.788 0 1.457.25 2.013.748.559.499.847 1.163.847 1.935 0 .342-.075.664-.229.964-.15.3-.362.559-.637.763l-.395.293.22.384c.131.239.193.482.193.73 0 .244-.042.471-.134.68a1.99 1.99 0 0 1-.311.539l-.021.029zm-5.566-4.313l-.788 1.276c.337.193.651.435.937.724.285.289.52.6.7.948.276.525.5 1.14.183 1.952-.317.811-1.45 1.09-1.95 1.09-.2 0-.4-.038-.599-.108l-.099-.028-.679.897c.262.115.493.205.893.255.4.05.802.075 1.209.075.512 0 1.028-.094 1.534-.283a3.683 3.683 0 0 0 1.293-.795c.354-.34.631-.74.834-1.205.203-.464.305-.957.305-1.49 0-.488-.08-.947-.248-1.376-.169-.429-.404-.804-.709-1.124a4.593 4.593 0 0 0-1.036-.822c-.389-.231-.798-.412-1.24-.54l-.459-.152.274-.447zm-1.067-1.089c-.785-.237-1.381-.162-1.846.236-.23.195-.411.452-.54.763-.135.31-.202.671-.202 1.077 0 .2.014.362.05.511.036.15.081.288.147.424l.045.09-.493.772c-.162-.295-.293-.673-.38-1.08-.086-.407-.13-.834-.13-1.292 0-.617.089-1.143.267-1.611.178-.47.429-.868.747-1.22a3.348 3.348 0 0 1 1.11-.743c.425-.168.867-.255 1.321-.255.639 0 1.203.136 1.676.39.473.252.9.61 1.291 1.067l.913 1.073-.701.455c-.261-.466-.595-.843-.987-1.114-.392-.271-.814-.414-1.288-.447z"/>
          </svg>
        </div>
        ${foldersHtml}
      </div>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          
          // Use the load event instead of DOMContentLoaded
          window.addEventListener('load', () => {
            // Add click event listeners to all folder headers
            document.querySelectorAll('.folder-header').forEach(header => {
              header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                if (content) {
                  content.classList.toggle('hidden');
                }
              });
            });
            
            // Add click event for files
            document.querySelectorAll('.file').forEach(file => {
              file.addEventListener('click', () => {
                const filePath = file.getAttribute('data-path');
                if (filePath) {
                  vscode.postMessage({
                    command: 'openFile',
                    filePath: filePath
                  });
                }
              });
            });
          });

          // Expose a global refresh function
          window.refresh = function() {
            vscode.postMessage({
              command: 'refresh'
            });
          };
        })();
      </script>
    </body>
    </html>`;
  }

  /**
   * Build HTML for a folder and its contents
   */
  private _buildFolderHtml(folder: config.TreeViewFolderEntry, level: number = 0): string {
    if (folder.hide) {
      return '';
    }

    const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';

    let html = `
      <div class="folder ${level > 0 ? 'subfolder' : ''}">
        <div class="folder-header">
          <span class="folder-icon">📁</span>
          <span class="folder-name">${this._escapeHtml(folder.name)}</span>
        </div>
        <div class="folder-content ${level > 0 ? 'hidden' : ''}">
    `;

    // Add sub-folders
    if (folder.folders && folder.folders.length > 0) {
      folder.folders.forEach(subFolder => {
        html += this._buildFolderHtml(subFolder, level + 1);
      });
    }

    // Add files
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach(file => {
        const filePath = config.getFullPath(file.path, workspacePath);
        const fileExists = fs.existsSync(filePath);

        html += `
          <div class="file" data-path="${this._escapeHtml(filePath)}" title="${this._escapeHtml(fileExists ? filePath : 'File not found: ' + filePath)}">
            <span class="file-icon">${fileExists ? '📄' : '⚠️'}</span>
            <span class="file-name">${this._escapeHtml(file.name)}</span>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private _escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
