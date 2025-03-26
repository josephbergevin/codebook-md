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
        case 'openFile': {
          if (data.filePath) {
            const workspacePath = workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
              return;
            }

            // If the path is relative, resolve it against the workspace folder
            const absolutePath = path.isAbsolute(data.filePath) ? data.filePath : path.join(workspacePath, data.filePath);

            if (!fs.existsSync(absolutePath)) {
              commands.executeCommand('vscode.showErrorMessage', `File not found: ${data.filePath}`);
              return;
            }

            const uri = Uri.file(absolutePath);
            commands.executeCommand('vscode.openWith', uri, 'codebook-md');
          }
          break;
        }
        case 'refresh': {
          this._updateWebview();
          break;
        }
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
    const settingsPath = config.getVSCodeSettingsFilePath();
    const treeData = config.getTreeViewFolders(settingsPath);

    // Build HTML for the folders and files
    let foldersHtml = '';
    treeData.forEach((folder, index) => {
      const folderIndex = index.toString();
      foldersHtml += this._buildFolderHtml(folder, 0, folderIndex);
    });

    if (!foldersHtml) {
      foldersHtml = '<p class="no-data">No notebooks found. Add folders and files using the buttons above.</p>';
    }

    // Read the HTML template
    const templatePath = path.join(this._extensionContext.extensionPath, 'dist', 'templates', 'notebooks.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholder with folders HTML
    htmlContent = htmlContent.replace('{{folders}}', foldersHtml);

    return htmlContent;
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
            <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
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
              <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.5l2 2H14v7z"/>
                <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
              </svg>
            </button>
            <button class="action-button icon-file" title="Add File" onclick="event.stopPropagation(); addFileToFolder('${this._escapeHtml(folder.name)}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4v3.5h-3.5v1h3.5v3.5h1v-3.5h3.5v-1h-3.5v-3.5z"/>
              </svg>
            </button>
            <button class="action-button icon-folder" title="Remove Folder" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(folderId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8v1h10V8H3z"/>
              </svg>
            </button>
            <button class="action-button icon-folder" title="Rename Folder" onclick="event.stopPropagation(); renameFolder('${this._escapeHtml(folder.name)}', '${this._escapeHtml(folder.name)}')">
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

        // Create a unique index for the file in the format of 'folderIndex[fileIndex]'
        const fileId = `${folderIndex}[${fileIndex}]`;

        // Check if it's a markdown file
        const isMarkdownFile = file.path.toLowerCase().endsWith('.md') || file.path.toLowerCase().endsWith('.markdown');

        // Always use the markdown icon for markdown files since we know they exist at this point
        const fileIconSvg = isMarkdownFile ? `
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3H14.85zM7 12.75L10.25 8 7 8v4.75zm-1.5 0L2.25 8h3.25v4.75zm6 0L15.75 8h-3.25v4.75z"/>
          </svg>
        ` : `
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
          </svg>
        `;

        html += `
          <div class="file" onclick="openFile('${this._escapeHtml(filePath)}', '${this._escapeHtml(file.path)}')" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(file.path)}" id="file-${this._escapeHtml(fileId)}">
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
