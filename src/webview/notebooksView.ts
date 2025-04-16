import {
  WebviewView,
  WebviewViewProvider,
  ExtensionContext,
  Uri,
  Disposable,
  commands,
  workspace,
  window,
  TextEditor
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
  private _currentEditorFile?: string; // Tracks the currently opened file
  private _dynamicFolderGroup?: folders.FolderGroup; // Stores the dynamic folder group
  private _isViewVisible: boolean = false; // Tracks if the view is currently visible

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

    // Listen for active editor changes to update the dynamic folder group
    const activeEditorListener = window.onDidChangeActiveTextEditor(editor => this._handleActiveEditorChange(editor));
    this._disposables.push(activeEditorListener);

    // Listen for webview visibility changes
    const viewStateListener = webviewView.onDidChangeVisibility(() => {
      this._isViewVisible = webviewView.visible;

      // If the view becomes visible, update it based on the current editor
      if (this._isViewVisible) {
        this._handleActiveEditorChange(window.activeTextEditor);
      }
    });
    this._disposables.push(viewStateListener);

    // Set initial state based on current editor
    this._isViewVisible = webviewView.visible;
    if (this._isViewVisible) {
      this._handleActiveEditorChange(window.activeTextEditor);
    }

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
        case 'createNewNotebook': {
          commands.executeCommand('codebook-md.createNewNotebook');
          break;
        }
        case 'createNotebookFromSelection': {
          commands.executeCommand('codebook-md.createNotebookFromSelection');
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

    // Create and add the dynamic folder group based on current editor
    if (this._currentEditorFile) {
      // Generate the dynamic folder group from the current editor file path
      this._dynamicFolderGroup = folders.createDynamicFolderGroupFromPath(this._currentEditorFile);

      if (this._dynamicFolderGroup && this._dynamicFolderGroup.folders.length > 0) {
        folderGroupsHtml += `
          <div class="folder-group dynamic-folder-group">
            <div class="folder-group-header dynamic-header">
              <h2 class="folder-group-title">
                <svg class="icon-svg context-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1.2c-.68 0-1.33.13-1.92.36L5.2 1.13a6.8 6.8 0 0 0-3.1 10.18l.89-.99a5.3 5.3 0 0 1 2.42-7.9l2 .4A4.8 4.8 0 0 0 3.2 8c0 2.66 2.16 4.8 4.8 4.8a4.8 4.8 0 0 0 4.24-7.02l.77-.64A6.78 6.78 0 0 1 14.8 8a6.78 6.78 0 0 1-6.8 6.8A6.78 6.78 0 0 1 1.2 8 6.83 6.83 0 0 1 8 1.2z"/>
                  <path d="M6.5 6h4l1 2-3.5 3.5L5 9l1.5-3z"/>
                </svg>
                ${this._escapeHtml(this._dynamicFolderGroup.name)}
              </h2>
              <p class="folder-group-description">${this._escapeHtml(this._dynamicFolderGroup.description)}</p>
            </div>
            <div class="folder-group-content">`
          ;

        // Add folders for this dynamic group
        // We use special index 'dynamic' to distinguish from regular folder groups
        this._dynamicFolderGroup.folders.forEach((folder, folderIndex) => {
          folderIndex++;
          const folderIndexStr = `dynamic-${folderIndex}`;
          folderGroupsHtml += this._buildDynamicFolderHtml(folder, 0, folderIndexStr);
        });

        folderGroupsHtml += `
            </div>
          </div>
        `;
      }
    }

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
            <button class="action-button" title="Remove from My Notebooks" onclick="event.stopPropagation(); return removeObject('${this._escapeHtml(folderEntityId)}', event);">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8v1h10V8H3z"/>
              </svg>
            </button>
            <button class="action-button" title="Rename" onclick="event.stopPropagation(); renameFolder('${this._escapeHtml(folder.name)}', '${this._escapeHtml(folder.name)}')">
              <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="folder-content">
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

        // Create a unique entity ID for the file that includes the folder index
        const fileEntityId = `${folderIndex}-${fileIndex}`;

        // Check if it's a markdown file
        const isMarkdownFile = file.path.toLowerCase().endsWith('.md') || file.path.toLowerCase().endsWith('.markdown');

        // Always use the markdown icon for markdown files
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

  /**
   * Handle changes in the active text editor
   * Updates the dynamic folder group when the user opens a different file
   */
  private _handleActiveEditorChange(editor: TextEditor | undefined) {
    // Only proceed if we have an active editor and the notebooks view is visible
    if (!editor || !this._isViewVisible) {
      return;
    }

    const filePath = editor.document.fileName;

    // If it's the same file as before, no need to update
    if (this._currentEditorFile === filePath) {
      return;
    }

    // Update current file path and refresh the webview
    this._currentEditorFile = filePath;

    // Only update the webview if it's visible to avoid unnecessary processing
    if (this._isViewVisible) {
      this._updateWebview();
    }
  }

  /**
   * Build HTML for a dynamic folder and its contents
   * Similar to _buildFolderHtml but simplified and without editing options
   */
  private _buildDynamicFolderHtml(folder: folders.FolderGroupFolder, level: number = 0, folderIndex: string): string {
    const workspacePath = config.getWorkspaceFolder();

    let html = `
      <div class="folder ${level > 0 ? 'subfolder' : ''}">
        <div class="folder-header" onclick="event.stopPropagation(); toggleFolder(this)">
          <span class="folder-icon">
            <svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
            </svg>
          </span>
          <span class="folder-name">${this._escapeHtml(folder.name)}</span>
        </div>
        <div class="folder-content">
    `;

    // Add sub-folders
    if (folder.folders && folder.folders.length > 0) {
      folder.folders.forEach((subFolder, subIndex) => {
        subIndex++;
        // Create a unique index for the subfolder
        const subFolderIndex = `${folderIndex}.${subIndex}`;
        html += this._buildDynamicFolderHtml(subFolder, level + 1, subFolderIndex);
      });
    }

    // Add files
    if (folder.files && folder.files.length > 0) {
      folder.files.forEach((file, fileIndex) => {
        fileIndex++;
        const filePath = config.getFullPath(file.path, workspacePath);

        // Create a unique entity ID for the file that includes the folder index
        const fileEntityId = `${folderIndex}-${fileIndex}`;

        // Check if it's a markdown file
        const isMarkdownFile = file.path.toLowerCase().endsWith('.md') || file.path.toLowerCase().endsWith('.markdown');

        // Always use the markdown icon for markdown files
        const fileIconSvg = isMarkdownFile ? `
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3H14.85zM7 12.75L10.25 8 7 8v4.75zm-1.5 0L2.25 8h3.25v4.75zm6 0L15.75 8h-3.25v4.75z"/>
          </svg>
        ` : `
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
          </svg>
        `;

        // For dynamic files, we don't include the action buttons
        html += `
          <div class="file" onclick="openFile('${this._escapeHtml(filePath)}', '${this._escapeHtml(file.path)}')" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(file.path)}" id="file-${this._escapeHtml(fileEntityId)}">
            <span class="file-icon">${fileIconSvg}</span>
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
}
