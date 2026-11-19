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
import * as relatedDocs from '../relatedDocs';
import { clearDocMetaCache, docTooltip, getDocMeta } from '../docMeta';
import { scopeMatchesFile } from '../docScope';
import { activeFilePaths, samePaths } from './activeFile';
import { isMarkdownFileName } from '../docTypes';
import * as sideBarSettings from '../sideBarSettings';
import { folderGroupDrawerHtml, gearButtonHtml, groupIconHtml, relatedDrawerHtml } from './groupDrawerHtml';
import { refreshSideBarSettingsPanel } from './sideBarSettingsPanel';
import {
  activeRowAttrs, appliesMarkHtml, docIconHtml, escapeHtml, hintHtml, issueMarkHtml,
  plainFileIconHtml, scopeChipHtml, titleAttr,
} from './notebooksViewHtml';

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
  private _refreshTimer?: ReturnType<typeof setTimeout>; // Debounces refreshes from file changes
  private _htmlActiveFiles: string[] = []; // The open file's paths as written into the page's HTML
  private _shownActiveFiles: string[] = []; // The open file's paths as the page marks them now
  private _redrawIsDue: boolean = false; // A markdown file changed, so the next refresh always redraws
  private _redrawOnShow: boolean = false; // Files changed while the view was hidden

  constructor(private readonly _extensionContext: ExtensionContext) { }

  dispose() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }
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
    const activeEditorListener = window.onDidChangeActiveTextEditor(editor => {
      this._handleActiveEditorChange(editor);
      this._syncActiveFile();
    });
    this._disposables.push(activeEditorListener);

    // A notebook can be the open file without any text editor being active,
    // so the highlighted row follows notebook editors as well
    this._disposables.push(window.onDidChangeActiveNotebookEditor(() => this._syncActiveFile()));

    // Listen for webview visibility changes
    const viewStateListener = webviewView.onDidChangeVisibility(() => {
      this._isViewVisible = webviewView.visible;

      // If the view becomes visible, update it based on the current editor
      if (this._isViewVisible) {
        this._handleActiveEditorChange(window.activeTextEditor);
        // The page was reloaded from its HTML, which may mark a file that is
        // no longer the open one
        this._shownActiveFiles = this._htmlActiveFiles;
        if (this._redrawOnShow || !samePaths(activeFilePaths(), this._htmlActiveFiles)) {
          this._updateWebview();
        }
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

            // Markdown opens as a notebook; a skill's scripts and other
            // files open in whichever editor VS Code picks for them
            const uri = Uri.file(absolutePath);
            if (isMarkdownFileName(absolutePath)) {
              commands.executeCommand('vscode.openWith', uri, 'codebook-md');
            } else {
              commands.executeCommand('vscode.open', uri);
            }
          }
          break;
        }
        case 'refresh': {
          // A manual refresh re-reads everything from disk
          relatedDocs.clearRelatedDocsCache();
          clearDocMetaCache();
          this._updateWebview();
          break;
        }
        case 'createNewFolderGroup': {
          this._createNewFolderGroup();
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
        case 'openDocumentation':
          if (data.section) {
            // Use the existing openDocumentation command with section parameter
            commands.executeCommand('codebook-md.openDocumentation', data.section);
          }
          break;
        case 'setSetting':
          // A switch or list in a group's drawer; the change redraws the view
          // through the configuration listener below
          void this._writeSetting(data.key, data.value);
          break;
        case 'updateGroup':
          // A field in the drawer of a group built by hand
          if (sideBarSettings.updateFolderGroup(config.getCodebookConfigFilePath(), data.index, data.patch)) {
            this._updateWebview();
            // The settings panel lists the same groups
            refreshSideBarSettingsPanel();
          }
          break;
        case 'openSideBarSettings':
          commands.executeCommand('codebook-md.openSideBarSettings', typeof data.groupId === 'string' ? data.groupId : undefined);
          break;
      }
    });

    // Watch for changes in .vscode/codebook-md.json
    const settingsWatcher = workspace.createFileSystemWatcher('**/.vscode/codebook-md.json');
    settingsWatcher.onDidChange(() => this._updateWebview());
    settingsWatcher.onDidCreate(() => this._updateWebview());
    settingsWatcher.onDidDelete(() => this._updateWebview());
    this._disposables.push(settingsWatcher);

    // Markdown files coming, going or changing can alter the tree: a new
    // skill, a renamed file, a front matter name. The scan is cached, so drop
    // the cache and redraw.
    const markdownWatcher = workspace.createFileSystemWatcher('**/*.{md,markdown}');
    markdownWatcher.onDidChange(() => this._refreshAfterFileChange());
    markdownWatcher.onDidCreate(() => this._refreshAfterFileChange());
    markdownWatcher.onDidDelete(() => this._refreshAfterFileChange());
    this._disposables.push(markdownWatcher);

    // Folders and other files coming or going can alter the tree too: a skill
    // folder deleted or renamed, a script added to a skill. Their names do not
    // match the markdown watcher, and removing a folder reports the folder
    // alone, not the files in it. Changes inside files are not needed here.
    const treeWatcher = workspace.createFileSystemWatcher('**/*', false, true, false);
    treeWatcher.onDidCreate(uri => this._refreshAfterTreeChange(uri.fsPath));
    treeWatcher.onDidDelete(uri => this._refreshAfterTreeChange(uri.fsPath));
    this._disposables.push(treeWatcher);

    // Redraw when the dynamic folder group's settings change
    this._disposables.push(workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codebook-md.dynamicFolderGroup')) {
        this._updateWebview();
      }
    }));
  }

  /** Writes a setting changed in a drawer, and says so when it cannot be saved. */
  private async _writeSetting(key: unknown, value: unknown): Promise<void> {
    try {
      await sideBarSettings.writeSetting(key, value, sideBarSettings.defaultScope());
    } catch (error) {
      console.error('Could not save the side bar setting:', error);
      window.showErrorMessage(`Codebook: could not save the setting - ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Redraw shortly after markdown files change. Saves and branch switches
   * arrive in bursts, so the redraw waits for them to settle.
   */
  private _refreshAfterFileChange(): void {
    relatedDocs.clearRelatedDocsCache();
    this._redrawIsDue = true;
    this._scheduleRefresh();
  }

  /**
   * Redraw shortly after a folder or a non-markdown file is added or removed,
   * but only when that changed a folder the tree was built from. Build output
   * and other churn elsewhere in the workspace leaves the view alone.
   */
  private _refreshAfterTreeChange(fsPath: string): void {
    if (isMarkdownFileName(fsPath)) {
      return; // the markdown watcher has it
    }
    this._scheduleRefresh();
  }

  /**
   * Waits for a burst of file events to settle, then redraws when the tree on
   * screen no longer matches the disk.
   */
  private _scheduleRefresh(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = undefined;
      const redrawIsDue = this._redrawIsDue;
      this._redrawIsDue = false;
      if (!this._isViewVisible) {
        this._redrawOnShow = true;
        return;
      }
      // Without a markdown change, only a stale dynamic folder group needs a redraw
      const treeIsStale = this._currentEditorFile !== undefined
        && !relatedDocs.isRelatedDocsCurrent(this._currentEditorFile);
      if (redrawIsDue || treeIsStale) {
        this._updateWebview();
      }
    }, 300);
  }

  /**
   * Moves the highlight to the open file's row without rebuilding the page.
   */
  private _syncActiveFile(): void {
    if (!this._view || !this._isViewVisible) {
      return;
    }
    const active = activeFilePaths();
    if (samePaths(active, this._shownActiveFiles)) {
      return;
    }
    this._shownActiveFiles = active;
    this._view.webview.postMessage({ command: 'setActiveFile', paths: active });
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

    // The open file's row is marked in the HTML itself; later changes are
    // sent to the page as messages
    this._htmlActiveFiles = activeFilePaths();
    this._shownActiveFiles = this._htmlActiveFiles;
    this._redrawOnShow = false;

    // Build HTML for the folder groups. The generated group sits among the
    // ones built by hand, at the position the settings give it.
    let folderGroupsHtml = '';
    const dynamicSettings = config.getDynamicFolderGroupConfig();
    const dynamicGroupHtml = this._buildDynamicGroupHtml(dynamicSettings);
    const handBuiltGroups = codebookConfig.folderGroups ?? [];
    const dynamicPosition = sideBarSettings.relatedPosition(dynamicSettings.position, handBuiltGroups.length);

    // If there are no folder groups, display a message
    if (handBuiltGroups.length === 0) {
      folderGroupsHtml += dynamicGroupHtml;
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
      handBuiltGroups.forEach((folderGroup, arrayIndex) => {
        if (arrayIndex === dynamicPosition) {
          folderGroupsHtml += dynamicGroupHtml;
        }
        const groupIndex = arrayIndex + 1;
        if (folderGroup.hide) {
          return; // Skip hidden folder groups
        }
        const startsCollapsed = folderGroup.collapsed === true;
        // Start the folder group with its title and description
        folderGroupsHtml += `
          <div class="folder-group${startsCollapsed ? ' collapsed' : ''}" id="folder-group-${this._escapeHtml(groupIndex.toString())}" data-group-key="group:${this._escapeHtml(folderGroup.name)}" data-start-collapsed="${startsCollapsed}">
            <div class="folder-group-header" onclick="toggleFolderGroup(this.parentElement, event)">
              <h2 class="folder-group-title">
                <svg class="folder-group-chevron icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z" />
                </svg>
                ${groupIconHtml(folderGroup.icon)}
                <span class="folder-group-name">${this._escapeHtml(folderGroup.name)}</span>
              </h2>
              ${gearButtonHtml(folderGroup.name)}
              ${folderGroup.description ? `<p class="folder-group-description">${this._escapeHtml(folderGroup.description)}</p>` : ''}
              <div class="folder-group-actions" onclick="event.stopPropagation()">
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
            ${folderGroupDrawerHtml(folderGroup, arrayIndex)}
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
      if (dynamicPosition >= handBuiltGroups.length) {
        folderGroupsHtml += dynamicGroupHtml;
      }
    }

    // Read the HTML template
    const templatePath = path.join(this._extensionContext.extensionPath, 'dist', 'templates', 'notebooks.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // Icons come from the codicon font shipped in dist/codicons
    const codiconsCssUri = this._view
      ? this._view.webview.asWebviewUri(
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist', 'codicons', 'codicon.css'))
      ).toString()
      : '';
    htmlContent = htmlContent.replace('{{codiconsCssUri}}', () => escapeHtml(codiconsCssUri));

    // Replace placeholder with folders HTML. A replacer function keeps `$`
    // sequences in file names from being read as replacement patterns.
    htmlContent = htmlContent.replace('{{folders}}', () => folderGroupsHtml);

    return htmlContent;
  }

  /**
   * Build the generated group for the file the tree is built around.
   * @returns an empty string when there is no such file, the group is turned
   * off or it has nothing to show
   */
  private _buildDynamicGroupHtml(settings: config.DynamicFolderGroupConfig): string {
    this._dynamicFolderGroup = this._currentEditorFile
      ? relatedDocs.createDynamicFolderGroupFromPath(this._currentEditorFile)
      : undefined;
    const group = this._dynamicFolderGroup;
    if (!group || group.folders.length === 0) {
      return '';
    }

    // The group's own icon when one is set, otherwise the one it has always had
    const iconHtml = groupIconHtml(settings.icon) || `<svg class="icon-svg context-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1.2c-.68 0-1.33.13-1.92.36L5.2 1.13a6.8 6.8 0 0 0-3.1 10.18l.89-.99a5.3 5.3 0 0 1 2.42-7.9l2 .4A4.8 4.8 0 0 0 3.2 8c0 2.66 2.16 4.8 4.8 4.8a4.8 4.8 0 0 0 4.24-7.02l.77-.64A6.78 6.78 0 0 1 14.8 8a6.78 6.78 0 0 1-6.8 6.8A6.78 6.78 0 0 1 1.2 8 6.83 6.83 0 0 1 8 1.2z"/>
                  <path d="M6.5 6h4l1 2-3.5 3.5L5 9l1.5-3z"/>
                </svg>`;
    const startsCollapsed = settings.startCollapsed === true;

    let html = `
          <div class="folder-group dynamic-folder-group${startsCollapsed ? ' collapsed' : ''}" id="dynamic-folder-group" data-group-key="${sideBarSettings.relatedGroupId}" data-start-collapsed="${startsCollapsed}">
            <div class="folder-group-header dynamic-header" onclick="toggleFolderGroup(this.parentElement, event)">
              <h2 class="folder-group-title">
                <svg class="folder-group-chevron icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z" />
                </svg>
                ${iconHtml}
                <span class="folder-group-name">${this._escapeHtml(group.name)}</span>
              </h2>
              ${gearButtonHtml(group.name)}
              <p class="folder-group-description">${this._escapeHtml(group.description)}</p>
            </div>
            ${relatedDrawerHtml(settings)}
            <div class="folder-group-content">`;

    // The special index 'dynamic' tells these folders from the ones built by hand
    group.folders.forEach((folder, folderIndex) => {
      html += this._buildDynamicFolderHtml(folder, 0, `dynamic-${folderIndex + 1}`);
    });

    html += `
            </div>
          </div>
        `;
    return html;
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
            <button class="action-button" title="Rename" onclick="event.stopPropagation(); renameFolderRow(this)" data-folder-name="${this._escapeHtml(folder.name)}">
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

        // File names and paths reach the page as data attributes only, never
        // inside a click handler's script: a name with a quote in it would
        // otherwise end the handler's string early.

        // Markdown files get an icon for their type and their description as
        // hover text; anything else keeps the plain file icon
        const isMarkdownFile = file.path.toLowerCase().endsWith('.md') || file.path.toLowerCase().endsWith('.markdown');
        let fileIconHtml = `
          <svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/>
          </svg>
        `;
        let fileTitle = '';
        if (isMarkdownFile) {
          const meta = getDocMeta(path.resolve(workspacePath, filePath));
          fileIconHtml = docIconHtml(meta.type);
          fileTitle = titleAttr(docTooltip(meta, filePath));
        }

        html += `
          <div class="file" onclick="openRow(this)" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(file.path)}" id="file-${this._escapeHtml(fileEntityId)}"${fileTitle}${activeRowAttrs(path.resolve(workspacePath, filePath), this._htmlActiveFiles)}>
            <span class="file-icon">${fileIconHtml}</span>
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
              <button class="action-button" title="Rename" onclick="event.stopPropagation(); renameFileRow(this)" data-name="${this._escapeHtml(file.name)}" data-item-path="${this._escapeHtml(file.path)}">
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
    return escapeHtml(unsafe);
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
   * Create a new folder group
   * Prompts the user for a name and creates a new folder group in the configuration
   */
  private async _createNewFolderGroup(): Promise<void> {
    // Prompt the user for a folder group name
    const folderGroupName = await window.showInputBox({
      prompt: 'Enter a name for the new folder group',
      placeHolder: 'My Folder Group'
    });

    if (!folderGroupName) {
      // User cancelled the input
      return;
    }

    // Get the config path
    const configPath = config.getCodebookConfigFilePath();
    const configDir = path.dirname(configPath);

    // Check if the .vscode directory exists
    if (!fs.existsSync(configDir)) {
      // Confirm with the user if they want to create the directory
      const createDirResponse = await window.showInformationMessage(
        `The ${configDir} directory does not exist. Create it?`,
        'Yes', 'No'
      );

      if (createDirResponse !== 'Yes') {
        return;
      }

      // Create the .vscode directory
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Check if the config file exists
    let codebookConfig: folders.CodebookConfig;
    if (!fs.existsSync(configPath)) {
      // Confirm with the user if they want to create the config file
      const createFileResponse = await window.showInformationMessage(
        `The ${configPath} file does not exist. Create it?`,
        'Yes', 'No'
      );

      if (createFileResponse !== 'Yes') {
        return;
      }

      // Create a new empty config
      codebookConfig = { folderGroups: [] };
    } else {
      // Read the existing config
      codebookConfig = folders.readCodebookConfig(configPath);
    }

    // Create a new folder group with the given name using the constructor
    const newFolderGroup = new folders.FolderGroup(
      folderGroupName,
      'user-defined',
      `Created on ${new Date().toLocaleDateString()}`,
      []
    );

    // Add the new folder group to the config
    if (!codebookConfig.folderGroups) {
      codebookConfig.folderGroups = [];
    }
    codebookConfig.folderGroups.push(newFolderGroup);

    // Write the updated config to the file
    fs.writeFileSync(configPath, JSON.stringify(codebookConfig, null, 2), 'utf8');

    // Show a success message
    window.showInformationMessage(`Folder group "${folderGroupName}" created successfully.`);

    // Refresh the webview to show the new folder group
    this._updateWebview();
  }

  /**
   * Build HTML for a dynamic folder and its contents
   * Similar to _buildFolderHtml but simplified and without editing options
   */
  private _buildDynamicFolderHtml(folder: folders.FolderGroupFolder, level: number = 0, folderIndex: string): string {
    // A generated group's paths are relative to the workspace folder the open
    // file is in, which is not always the first one. Its rows carry absolute
    // paths, so opening one never depends on which folder that is.
    const workspacePath = this._dynamicFolderGroup?.basePath || config.getWorkspaceFolder();

    // A folder that stands for a file - a skill with supporting files - shows
    // that file's icon, opens it when its name is clicked and starts collapsed
    const docPath = folder.filePath ? config.getFullPath(folder.filePath, workspacePath) : '';
    const folderIconHtml = folder.filePath && folder.docType
      ? docIconHtml(folder.docType)
      : `<svg class="icon-svg icon-folder" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3H7.71l-2-2H1.5l-.5.5v11l.5.5h13l.5-.5v-9l-.5-.5zM14 13H2V4h5.71l2 2H14v7z"/>
            </svg>`;
    const childCount = folder.files.length + folder.folders.length;
    const folderNameHtml = folder.filePath
      ? `<span class="folder-name doc-folder-name" onclick="event.stopPropagation(); openRow(this)" data-item-path="${this._escapeHtml(path.resolve(workspacePath, folder.filePath))}">${this._escapeHtml(folder.name)}</span>${hintHtml(childCount > 0 ? `+${childCount}` : undefined)}${issueMarkHtml(folder.issues)}`
      : `<span class="folder-name">${this._escapeHtml(folder.name)}</span>`;
    const folderActiveAttrs = folder.filePath
      ? activeRowAttrs(path.resolve(workspacePath, docPath), this._htmlActiveFiles)
      : '';

    let html = `
      <div class="folder ${level > 0 ? 'subfolder' : ''}${folder.filePath ? ' doc-folder' : ''}">
        <div class="folder-header" onclick="event.stopPropagation(); toggleFolder(this)"${titleAttr(folder.tooltip)}${folderActiveAttrs}>
          <span class="folder-icon">
            ${folderIconHtml}
          </span>
          ${folderNameHtml}
        </div>
        <div class="folder-content${folder.filePath ? ' hidden' : ''}">
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

        // A skill's scripts and other non-markdown files get a plain file icon
        const rowIconHtml = isMarkdownFileName(file.path) ? docIconHtml(file.docType ?? 'markdown') : plainFileIconHtml();

        // A scoped rule shows its scope, and a mark when that scope covers
        // the file the tree was built around
        const appliesToOpenFile = file.scope !== undefined && this._currentEditorFile !== undefined
          && scopeMatchesFile(file.scope, path.resolve(workspacePath, file.scopeBase ?? ''), this._currentEditorFile);

        // For dynamic files, we don't include the action buttons
        html += `
          <div class="file" onclick="openRow(this)" data-path="${this._escapeHtml(filePath)}" data-item-path="${this._escapeHtml(path.resolve(workspacePath, file.path))}" id="file-${this._escapeHtml(fileEntityId)}"${titleAttr(file.tooltip)}${activeRowAttrs(path.resolve(workspacePath, filePath), this._htmlActiveFiles)}>
            <span class="file-icon">${rowIconHtml}</span>
            <span class="file-name">${this._escapeHtml(file.name)}</span>
            ${hintHtml(file.hint)}${scopeChipHtml(file.scope)}${issueMarkHtml(file.issues)}${appliesMarkHtml(appliesToOpenFile)}
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
