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
import * as folders from '../folders';

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
          commands.executeCommand('codebook-md.addFolderToFolderGroup', data.groupIndex);
          break;
        case 'addFile':
          commands.executeCommand('codebook-md.addFileToChosenFolder', data.groupIndex);
          break;
        case 'addSubFolder':
          if (data.folderName) {
            commands.executeCommand('codebook-md.addSubFolderToMyNotebooksFolder', data.folderName);
          }
          break;
        case 'addFileToFolder':
          if (data.folderName) {
            commands.executeCommand('codebook-md.addFileToMyNotebooksFolder', data.folderName, data.groupIndex);
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
        case 'removeObjectFromFolderGroup':
          if (data.objectId) {
            commands.executeCommand('codebook-md.removeObjectFromFolderGroup', data.objectId);
          }
          break;
        case 'moveItemUp':
          if (data.objectId) {
            commands.executeCommand('codebook-md.moveFolderGroupEntityUp', data.objectId);
          }
          break;
        case 'moveItemDown':
          if (data.objectId) {
            commands.executeCommand('codebook-md.moveFolderGroupEntityDown', data.objectId);
          }
          break;
      }
    });

    // Watch for changes in .vscode/codebook-md.json
    const settingsWatcher = workspace.createFileSystemWatcher('**/.vscode/codebook-md.json');
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
   * Update the webview content - public method that can be called from outside
   */
  public updateWebview(): void {
    this._updateWebview();
  }

  /**
   * Get the webview HTML content
   */
  private _getWebviewContent() {
    // Get the config path
    const configPath = config.getCodebookConfigFilePath();

    // Read the configuration file to get all folder groups
    const codebookConfig = folders.readCodebookConfig(configPath);

    // Build HTML for the folder groups
    let folderGroupsHtml = '';

    // Add a refresh button at the top
    folderGroupsHtml += `
      <div class="top-actions">
        <button class="action-button refresh-button" title="Refresh View" onclick="refresh()">
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c0 1.654-1.346 3-3 3-.795 0-1.545-.311-2.107-.868-.563-.567-.873-1.317-.873-2.111 0-1.431 1.007-2.632 2.351-2.929v2.926s2.528-2.087 2.984-2.461c.456-.373.202-.746-.254-.373-.354.287-2.984 2.461-2.984 2.461v-2.926c-2.077.463-3.635 2.319-3.635 4.544 0 2.559 2.087 4.646 4.647 4.646 2.559 0 4.646-2.088 4.646-4.646 0-.598-.127-1.631-.484-2.606-.229-.486-.471-.961-.846-1.351-.463-.489-.075-.952.397-.452.472.478.785.942 1.056 1.368.418.713.589 1.356.589 3.041 0 3.206-2.607 5.813-5.813 5.813-3.206 0-5.813-2.607-5.813-5.813 0-3.206 2.607-5.813 5.813-5.813 1.859 0 3.516.886 4.572 2.256l.169.216.035-.18c.233-.535.496-.858.872-1.016.13-.055.21-.031.137.043z"/>
          </svg>
          Refresh
        </button>
      </div>
    `;

    // If there are no folder groups, display a message
    if (!codebookConfig.folderGroups || codebookConfig.folderGroups.length === 0) {
      folderGroupsHtml += '<p class="no-data">No notebooks found. Add folders and files using the buttons below.</p>';
      folderGroupsHtml += `
        <div class="global-actions">
          <button class="action-button" title="Add Folder" onclick="addFolder()">
            <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
              <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
            </svg>
            Add Folder
          </button>
          <button class="action-button" title="Add File" onclick="addFile()">
            <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
              <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
            </svg>
            Add File
          </button>
        </div>
      `;
    } else {
      // Process each folder group
      codebookConfig.folderGroups.forEach((folderGroup, groupIndex) => {
        groupIndex++;
        if (folderGroup.hide) {
          return; // Skip hidden folder groups
        }
        // Start the folder group with its title and description
        folderGroupsHtml += `
          <div class="folder-group" id="folder-group-${this._escapeHtml(groupIndex.toString())}">
            <div class="folder-group-header">
              <h2 class="folder-group-title">${this._escapeHtml(folderGroup.name)}</h2>
              ${folderGroup.description ? `<p class="folder-group-description">${this._escapeHtml(folderGroup.description)}</p>` : ''}
              <div class="folder-group-actions">
                <button class="action-button" title="Add Folder" onclick="addFolderToGroup(${groupIndex})">
                  <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
                    <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
                  </svg>
                  Add Folder
                </button>
                <button class="action-button" title="Add File" onclick="addFile(${groupIndex})">
                  <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
                    <path d="M8.5 8v-1h-1v1h-1v1h1v1h1v-1h1v-1h-1z"/>
                  </svg>
                  Add File
                </button>
              </div>
            </div>
            <div class="folder-group-content">`
          ;

        // Add folders for this group
        if (folderGroup.folders && folderGroup.folders.length > 0) {
          folderGroup.folders.forEach((folder, folderIndex) => {
            folderIndex++;
            // Create a unique index for the folder that includes the group index
            const folderIndexStr = `${groupIndex}-${folderIndex}`;
            folderGroupsHtml += this._buildFolderHtml(groupIndex, folder, 0, folderIndexStr);
          });
        } else {
          folderGroupsHtml += '<p class="no-data">No folders in this group. Add folders and files using the buttons above.</p>';
        }

        folderGroupsHtml += `
            </div>
          </div>
        `;
      });
    }

    // Read the HTML template
    const templatePath = path.join(this._extensionContext.extensionPath, 'dist', 'templates', 'notebooks.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholder with folders HTML
    htmlContent = htmlContent.replace('{{folders}}', folderGroupsHtml);

    return htmlContent;
  }

  /**
   * Build HTML for a folder and its contents
   */
  private _buildFolderHtml(groupIndex: number, folder: folders.FolderGroupFolder, level: number = 0, folderIndex: string): string {
    if (folder.hide) {
      return '';
    }

    const workspacePath = config.getWorkspaceFolder();
    const folderEntityId = `${folderIndex}-0`;

    let html = `
      <div class="folder ${level > 0 ? 'subfolder' : ''}" id="folder-${this._escapeHtml(folderEntityId)}">
        <div class="folder-header" onclick="event.stopPropagation(); toggleFolder(this)">
          <span class="folder-icon">
            <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
            </svg>
          </span>
          <span class="folder-name">${this._escapeHtml(folder.name)}</span>
          <div class="actions">
            <button class="action-button" title="Move Up" onclick="event.stopPropagation(); return moveItemUp('${this._escapeHtml(folderEntityId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4.5l-5 5h3V12h4V9.5h3L8 4.5z"/>
              </svg>
            </button>
            <button class="action-button" title="Move Down" onclick="event.stopPropagation(); return moveItemDown('${this._escapeHtml(folderEntityId)}', event);">
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
            <button class="action-button icon-file" title="Add File" onclick="event.stopPropagation(); addFileToFolder('${this._escapeHtml(folder.name)}', '${this._escapeHtml(folderIndex.split('.')[0])}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4v3.5h-3.5v1h3.5v3.5h1v-3.5h3.5v-1h-3.5v-3.5z"/>
              </svg>
            </button>
            <button class="action-button icon-folder" title="Remove Folder" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(folderEntityId)}', event);">
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
        subIndex++;
        // Create a unique index for the subfolder
        const subFolderIndex = `${groupIndex}-${folderIndex}.${subIndex}`;
        html += this._buildFolderHtml(groupIndex, subFolder, level + 1, subFolderIndex);
      });
    }

    // Add files
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach((file, fileIndex) => {
        fileIndex++;
        const filePath = config.getFullPath(file.path, workspacePath);

        // Create a unique index for the file - folderIndex already includes groupIndex
        // and subIndex (if applicable), so we just need to append the fileIndex
        const fileEntityId = `${folderIndex}-${fileIndex}`;
        // if the fileId does not contain 2 dashes, log an error to the console
        if ((fileEntityId.match(/-/g) || []).length !== 2) {
          console.error(`File ID "${fileEntityId}" does not contain 2 dashes.`);
        }

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
          <div class="file" onclick="openFile('${this._escapeHtml(filePath)}', '${this._escapeHtml(file.path)}')" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(file.path)}" id="file-${this._escapeHtml(fileEntityId)}">
            <span class="file-icon">${fileIconSvg}</span>
            <span class="file-name">${this._escapeHtml(file.name)}</span>
            <div class="actions">
              <button class="action-button" title="Move Up" onclick="event.stopPropagation(); return moveItemUp('${this._escapeHtml(fileEntityId)}', event);">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 4.5l-5 5h3V12h4V9.5h3L8 4.5z"/>
                </svg>
              </button>
              <button class="action-button" title="Move Down" onclick="event.stopPropagation(); return moveItemDown('${this._escapeHtml(fileEntityId)}', event);">
                <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 11.5l5-5H10V4H6v2.5H3L8 11.5z"/>
                </svg>
              </button>
              <button class="action-button" title="Remove from My Notebooks" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(fileEntityId)}', event);">
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
