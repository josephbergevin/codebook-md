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
        case 'addFolder':
          commands.executeCommand('codebook-md.addFolderToTreeView');
          break;
        case 'addFile':
          commands.executeCommand('codebook-md.addFileToChosenFolder');
          break;
        case 'addSubFolder':
          if (data.folderName) {
            commands.executeCommand('codebook-md.addSubFolderToMyNotebooksFolder', data.folderName);
          }
          break;
        case 'addFileToFolder':
          if (data.folderName) {
            commands.executeCommand('codebook-md.addFileToMyNotebooksFolder', data.folderName);
          }
          break;
        case 'removeFolder':
          if (data.folderName) {
            commands.executeCommand('codebook-md.removeFolderFromMyNotebooksFolder', data.folderName);
          }
          break;
        case 'removeFile':
          if (data.entry) {
            commands.executeCommand('codebook-md.removeFileFromMyNotebooksFolder', {
              name: data.entry.name,
              path: data.entry.path
            });
          }
          break;
        case 'renameFile':
          if (data.entry) {
            commands.executeCommand('codebook-md.renameFileInMyNotebooks', {
              name: data.entry.name,
              path: data.entry.path
            });
          }
          break;
        case 'renameFolder':
          if (data.folderName) {
            // Pass the folder name directly as a string parameter
            commands.executeCommand('codebook-md.renameFolderInMyNotebooks', data.folderName);
          }
          break;
        case 'removeObjectFromTreeView':
          if (data.objectId) {
            commands.executeCommand('codebook-md.removeObjectFromTreeView', data.objectId);
          }
          break;
        case 'moveItemUp':
          if (data.objectId) {
            commands.executeCommand('codebook-md.moveTreeViewItemUp', data.objectId);
          }
          break;
        case 'moveItemDown':
          if (data.objectId) {
            commands.executeCommand('codebook-md.moveTreeViewItemDown', data.objectId);
          }
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
    treeData.forEach((folder, index) => {
      const folderIndex = index.toString();
      foldersHtml += this._buildFolderHtml(folder, 0, folderIndex);
    });

    if (!foldersHtml) {
      foldersHtml = '<p class="no-data">No notebooks found. Add folders and files using the buttons above.</p>';
    }

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
          position: relative;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 10px;
          padding: 5px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .toolbar-button {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          margin-left: 8px;
          display: flex;
          align-items: center;
          color: var(--vscode-foreground);
          border-radius: 3px;
        }
        .toolbar-button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar-button svg {
          margin-right: 5px;
        }
        .folder {
          margin-bottom: 10px;
          position: relative;
        }
        .folder-header {
          display: flex;
          align-items: center;
          font-weight: bold;
          cursor: pointer;
          padding: 5px;
          border-radius: 4px;
          position: relative;
        }
        .folder-header:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .folder-name {
          margin-left: 5px;
          flex-grow: 1;
        }
        .folder-icon {
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
          position: relative;
        }
        .file:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .file-icon {
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .file-name {
          margin-left: 5px;
          flex-grow: 1;
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
        .actions {
          display: none;
          position: absolute;
          right: 5px;
          top: 50%;
          transform: translateY(-50%);
          background-color: var(--vscode-editor-background);
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          z-index: 10;
        }
        .folder-header:hover .actions,
        .file:hover .actions {
          display: flex;
        }
        .action-button {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          margin: 0 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--vscode-foreground);
          border-radius: 3px;
        }
        .action-button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .action-button svg {
          width: 14px;
          height: 14px;
        }
        .icon-svg {
          fill: currentColor;
          width: 16px;
          height: 16px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="toolbar">
          <button class="toolbar-button" title="New Folder" onclick="addFolder()">
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.5l2 2H14v7z"/>
              <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
            </svg>
            New Folder
          </button>
          <button class="toolbar-button" title="New File" onclick="addFile()">
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
              <path d="M9 9H7V7H6v2H4v1h2v2h1v-2h2V9z"/>
            </svg>
            New File
          </button>
          <button class="toolbar-button" title="Refresh" onclick="refresh()">
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c.146.689.55 1.31 1.125 1.723.25.18.5.275.75.275.2 0 .4-.05.6-.15l.526-.302.272.272a.95.95 0 0 0 .65.284.95.95 0 0 0 .668-.284c.35-.349.4-.7.4-1.087 0-.38-.075-.75-.3-1.147l-.225-.392-.048-.83c-.03-.595-.295-1.12-.738-1.5-.374-.318-.814-.47-1.3-.5zm.948 5.316a.456.456 0 0 1-.318.137.456.456 0 0 1-.318-.137l-.413-.414-1.118.655c-.099.05-.199.075-.299.075a.493.493 0 0 1-.375-.139c-.275-.199-.508-.553-.61-1.022l-.069-.345-.13-.145c.15-1.142.564-1.931.831-2.274l.255-.195-.592-.762c-.202.335-.458.848-.609 1.631-.15.775-.076 1.677.225 2.573.148.436.42.853.804 1.142.381.287.818.429 1.307.429.425 0 .852-.116 1.239-.347l.546-.32.405.405c.084.084.192.125.3.125a.43.43 0 0 0 .3-.125A.442.442 0 0 0 15 11.667c0-.188-.042-.362-.125-.512l-.345-.609.162-.203c.139-.174.262-.373.369-.597.109-.224.164-.457.164-.7 0-.43-.077-.824-.249-1.155-.15-.315-.434-.672-.813-.965-.382-.292-.825-.424-1.327-.424-.433 0-.856.119-1.236.354l-.533.315-.583-.754c.241-.18.516-.331.822-.453.302-.119.615-.18.933-.18.788 0 1.457.25 2.013.748.559.499.847 1.163.847 1.935 0 .342-.075.664-.229.964-.15.3-.362.559-.637.763l-.395.293.22.384c.131.239.193.482.193.73 0 .244-.042.471-.134.68a1.99 1.99 0 0 1-.311.539l-.021.029z"/>
            </svg>
            Refresh
          </button>
        </div>
        ${foldersHtml}
      </div>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();

          window.toggleFolder = function(header) {
            const content = header.nextElementSibling;
            if (content) {
              content.classList.toggle('hidden');
            }
          };
          
          window.openFile = function(filePath) {
            vscode.postMessage({
              command: 'openFile',
              filePath: filePath
            });
          };

          window.refresh = function() {
            vscode.postMessage({
              command: 'refresh'
            });
          };
          
          window.addFolder = function() {
            vscode.postMessage({
              command: 'addFolder'
            });
          };
          
          window.addFile = function() {
            vscode.postMessage({
              command: 'addFile'
            });
          };
          
          window.addSubFolder = function(folderName) {
            vscode.postMessage({
              command: 'addSubFolder',
              folderName: folderName
            });
          };
          
          window.addFileToFolder = function(folderName) {
            vscode.postMessage({
              command: 'addFileToFolder',
              folderName: folderName
            });
          };
          
          window.removeFolder = function(folderName, event) {
            // Stop event propagation immediately
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }
            
            vscode.postMessage({
              command: 'removeFolder',
              folderName: folderName
            });
            return false; // Prevent default action
          };
          
          window.removeFile = function(name, path, event) {
            // Stop event propagation immediately to prevent file opening
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }
            
            vscode.postMessage({
              command: 'removeFile',
              entry: { name, path }
            });
            return false; // Prevent default action
          };
          
          window.removeObject = function(objectId, event) {
            // Stop event propagation immediately
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }
            
            vscode.postMessage({
              command: 'removeObjectFromTreeView',
              objectId: objectId
            });
            return false; // Prevent default action
          };
          
          window.renameFile = function(name, path) {
            vscode.postMessage({
              command: 'renameFile',
              entry: { name, path }
            });
          };
          
          window.renameFolder = function(folderName, currentName) {
            vscode.postMessage({
              command: 'renameFolder',
              folderName: folderName,
              currentName: currentName
            });
          };
          
          window.moveItemUp = function(objectId, event) {
            // Stop event propagation immediately
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }
            
            vscode.postMessage({
              command: 'moveItemUp',
              objectId: objectId
            });
            return false; // Prevent default action
          };
          
          window.moveItemDown = function(objectId, event) {
            // Stop event propagation immediately
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }
            
            vscode.postMessage({
              command: 'moveItemDown',
              objectId: objectId
            });
            return false; // Prevent default action
          };
        })();
      </script>
    </body>
    </html>`;
  }

  /**
   * Build HTML for a folder and its contents
   */
  private _buildFolderHtml(folder: config.TreeViewFolderEntry, level: number = 0, folderIndex: string): string {
    if (folder.hide) {
      return '';
    }

    const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';

    // The ID for the folder in the format of 'folderIndex'
    const folderId = folderIndex;

    let html = `
      <div class="folder ${level > 0 ? 'subfolder' : ''}" id="folder-${this._escapeHtml(folderId)}">
        <div class="folder-header" onclick="event.stopPropagation(); toggleFolder(this)">
          <span class="folder-icon">
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
            </svg>
          </span>
          <span class="folder-name">${this._escapeHtml(folder.name)}</span>
          <div class="actions">
            <button class="action-button" title="Move Up" onclick="event.stopPropagation(); return moveItemUp('${this._escapeHtml(folderId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4.5l-5 5h3V12h4V9.5h3L8 4.5z"/>
              </svg>
            </button>
            <button class="action-button" title="Move Down" onclick="event.stopPropagation(); return moveItemDown('${this._escapeHtml(folderId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 11.5l5-5H10V4H6v2.5H3L8 11.5z"/>
              </svg>
            </button>
            <button class="action-button" title="Add Sub-folder" onclick="event.stopPropagation(); addSubFolder('${this._escapeHtml(folder.name)}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.5l2 2H14v7z"/>
                <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
              </svg>
            </button>
            <button class="action-button" title="Add File" onclick="event.stopPropagation(); addFileToFolder('${this._escapeHtml(folder.name)}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4v3.5h-3.5v1h3.5v3.5h1v-3.5h3.5v-1h-3.5v-3.5z"/>
              </svg>
            </button>
            <button class="action-button" title="Remove Folder" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(folderId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8v1h10V8H3z"/>
              </svg>
            </button>
            <button class="action-button" title="Rename Folder" onclick="event.stopPropagation(); renameFolder('${this._escapeHtml(folder.name)}', '${this._escapeHtml(folder.name)}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="folder-content ${level > 0 ? 'hidden' : ''}">
    `;

    // Add sub-folders
    if (folder.folders && folder.folders.length > 0) {
      folder.folders.forEach((subFolder, subIndex) => {
        // Create a unique index for the subfolder
        const subFolderIndex = `${folderIndex}.${subIndex}`;
        html += this._buildFolderHtml(subFolder, level + 1, subFolderIndex);
      });
    }

    // Add files
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach((file, fileIndex) => {
        const filePath = config.getFullPath(file.path, workspacePath);
        const fileExists = fs.existsSync(filePath);

        // Create a unique index for the file in the format of 'folderIndex[fileIndex]'
        const fileId = `${folderIndex}[${fileIndex}]`;

        // Check if it's a markdown file
        const isMarkdownFile = filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown');

        // Use appropriate SVG icon based on file type and existence
        let fileIconSvg;

        if (!fileExists) {
          // Warning icon for non-existent files
          fileIconSvg = `
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 1l7 14H1L8 1zm0 3L3.5 13h9L8 4z"/>
              <path d="M7.5 6h1v5h-1V6z"/>
              <path d="M7.5 12h1v1h-1v-1z"/>
            </svg>
          `;
        } else if (isMarkdownFile) {
          // Markdown-specific icon
          fileIconSvg = `
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3H14.85zM7 12.75L10.25 8 7 8v4.75zm-1.5 0L2.25 8h3.25v4.75zm6 0L15.75 8h-3.25v4.75z"/>
            </svg>
          `;
        } else {
          // Generic file icon
          fileIconSvg = `
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
            </svg>
          `;
        }

        html += `
          <div class="file" onclick="openFile('${this._escapeHtml(filePath)}')" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(file.path)}" id="file-${this._escapeHtml(fileId)}">
            <span class="file-icon">${fileIconSvg}</span>
            <span class="file-name">${this._escapeHtml(file.name)}</span>
            <div class="actions">
              <button class="action-button" title="Move Up" onclick="event.stopPropagation(); return moveItemUp('${this._escapeHtml(fileId)}', event);">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 4.5l-5 5h3V12h4V9.5h3L8 4.5z"/>
                </svg>
              </button>
              <button class="action-button" title="Move Down" onclick="event.stopPropagation(); return moveItemDown('${this._escapeHtml(fileId)}', event);">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 11.5l5-5H10V4H6v2.5H3L8 11.5z"/>
                </svg>
              </button>
              <button class="action-button" title="Remove from My Notebooks" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(fileId)}', event);">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 8v1h10V8H3z"/>
                </svg>
              </button>
              <button class="action-button" title="Rename" onclick="event.stopPropagation(); renameFile('${this._escapeHtml(file.name)}', '${this._escapeHtml(file.path)}')">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/>
                </svg>
              </button>
            </div>
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
