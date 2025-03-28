import {
  languages, commands, window, notebooks, workspace,
  ExtensionContext, StatusBarAlignment, NotebookCell,
  NotebookSerializer, NotebookData, NotebookCellData,
  CancellationToken, Uri,
} from 'vscode';
import * as folders from './folders';

import { Kernel } from './kernel';
import * as codebook from './codebook';
import * as fs from 'fs';
import * as config from './config';
import * as path from 'path';
import { NotebooksViewProvider } from './webview/notebooksView';
import { WelcomeViewProvider } from './webview/welcomeView';
import { DocumentationViewProvider } from './webview/documentationView';
import * as configModal from './webview/configModal';

const kernel = new Kernel();

// Helper functions moved to the top
async function addFileToTreeViewFolder(folderGroup: folders.FolderGroup, filePath: string, folderName: string): Promise<void> {
  try {
    console.log(`Adding file ${filePath} to folder ${folderName}`);

    // Get display name from user
    const fileName = path.basename(filePath);
    const displayName = await window.showInputBox({
      placeHolder: fileName,
      prompt: 'Enter a display name for this markdown file',
      value: folders.suggestedDisplayName(fileName)
    });

    if (!displayName) {
      return; // User canceled
    }

    // Find the target folder
    const targetFolder = folderGroup.findFolder(folderName);
    if (!targetFolder) {
      window.showErrorMessage(`Folder ${folderName} not found`);
      return;
    }

    // Initialize files array if it doesn't exist
    if (!targetFolder.files) {
      targetFolder.files = [];
    }

    // Get the workspace folder path
    const workspacePath = config.getWorkspaceFolder();
    if (!workspacePath) {
      window.showErrorMessage('No workspace folder found');
      return;
    }

    // Convert to relative path using getFullPath
    const normalizedPath = config.getFullPath(filePath, workspacePath);

    // Check if file already exists in the folder by comparing paths
    const existingIndex = targetFolder.files.findIndex(f =>
      config.getFullPath(f.path, workspacePath) === normalizedPath
    );

    if (existingIndex >= 0) {
      // Update existing file entry
      targetFolder.files[existingIndex].name = displayName;
      targetFolder.files[existingIndex].path = normalizedPath;
      window.showInformationMessage(`Updated markdown file in folder: ${displayName}`);
      console.log(`Added markdown file to folder: ${displayName}`);
      console.log(`filePath: ${filePath}`);
      console.log(`normalizedPath: ${normalizedPath}`);
      console.log(`workspacePath: ${workspacePath}`);
    } else {
      // Add new file entry
      targetFolder.files.push({
        name: displayName,
        path: normalizedPath
      });
      window.showInformationMessage(`Added markdown file to folder: ${displayName}`);
      console.log(`Added markdown file to folder: ${displayName}`);
      console.log(`filePath: ${filePath}`);
      console.log(`normalizedPath: ${normalizedPath}`);
      console.log(`workspacePath: ${workspacePath}`);
    }

    // Update settings
    folderGroup.applyChanges();
  } catch (error) {
    console.error('Error adding file to folder:', error);
    window.showErrorMessage(`Failed to add file to folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function addFolderToTreeView(): Promise<void> {
  try {
    // Get folder name from user
    const folderName = await window.showInputBox({
      placeHolder: 'Animals',
      prompt: 'Enter a display name for this folder',
      value: ''
    });

    if (!folderName) {
      return; // User canceled
    }

    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);

    folderGroup.folders.push(new folders.FolderGroupFolder(folderName));
    window.showInformationMessage(`Added folder to tree view: ${folderName}`);

    // Update settings
    folderGroup.applyChanges();
  } catch (error) {
    console.error('Error adding folder to tree view:', error);
    window.showErrorMessage(`Failed to add folder to tree view: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function addSubFolder(parentFolderName: string): Promise<void> {
  try {
    // Get the display name for the new sub-folder from user
    const folderName = await window.showInputBox({
      placeHolder: 'Sub-folder name',
      prompt: 'Enter a display name for this sub-folder',
      value: ''
    });

    if (!folderName) {
      return; // User canceled
    }

    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);

    // Find the parent folder
    const parentFolder = folderGroup.findFolder(parentFolderName);
    if (!parentFolder) {
      window.showErrorMessage(`Parent folder ${parentFolderName} not found`);
      return;
    }

    // Initialize subfolders array if it doesn't exist
    if (!parentFolder.folders) {
      parentFolder.folders = [];
    }

    // Add new sub-folder
    parentFolder.folders.push(new folders.FolderGroupFolder(folderName));
    window.showInformationMessage(`Added sub-folder ${folderName} to ${parentFolderName}`);

    // Update settings
    folderGroup.applyChanges();
  } catch (error) {
    console.error('Error adding sub-folder:', error);
    window.showErrorMessage(`Failed to add sub-folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function renameFolderDisplay(folderName: string, currentDisplayName: string): Promise<void> {
  try {
    // Add debug logging at the start of the function
    console.log(`renaming folder ${folderName}`);

    // Get new display name from user
    const newName = await window.showInputBox({
      placeHolder: currentDisplayName,
      prompt: 'Enter a new display name for this folder',
      value: currentDisplayName
    });

    if (!newName || newName === currentDisplayName) {
      return; // User canceled or no change
    }

    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);

    const folder = folderGroup.findFolder(folderName);
    if (!folder) {
      window.showErrorMessage(`Folder ${folderName} not found`);
      return;
    }

    // Update the folder's display name
    folder.name = newName;
    window.showInformationMessage(`Renamed folder to: ${newName}`);

    // Update settings
    folderGroup.applyChanges();
  } catch (error) {
    console.error('Error renaming folder:', error);
    window.showErrorMessage(`Failed to rename folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function removeFolderFromTreeView(folderName: string): Promise<void> {
  try {
    console.log(`Removing folder ${folderName} from tree view`);

    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);

    const success = folderGroup.removeFolder(folderName);
    if (!success) {
      window.showWarningMessage('Folder not found in tree view');
      return;
    }

    folderGroup.applyChanges();
    window.showInformationMessage(`Removed folder ${folderName} from tree view`);
  } catch (error) {
    console.error('Error removing folder from tree view:', error);
    window.showErrorMessage(`Failed to remove folder from tree view: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function renameTreeViewFile(entry: folders.FolderGroupFile, newName: string): Promise<void> {
  try {
    console.log(`Renaming file from "${entry.name}" to "${newName}"`);

    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);
    const workspacePath = config.getWorkspaceFolder();
    let fileRenamed = false;

    const renameFile = (folders: folders.FolderGroupFolder[]): boolean => {
      for (const folder of folders) {
        if (folder.files) {
          const fileIndex = folder.files.findIndex(f =>
            f.name === entry.name && config.getFullPath(f.path, workspacePath) === config.getFullPath(entry.path, workspacePath));

          if (fileIndex !== -1) {
            folder.files[fileIndex] = {
              ...folder.files[fileIndex],
              name: newName
            };
            fileRenamed = true;
            return true;
          }
        }
        if (folder.folders) {
          if (renameFile(folder.folders)) {
            return true;
          }
        }
      }
      return false;
    };

    renameFile(folderGroup.folders);

    if (!fileRenamed) {
      window.showWarningMessage('File not found in tree view');
      return;
    }

    // Update settings
    folderGroup.applyChanges();
    window.showInformationMessage(`Renamed file to: ${newName}`);
  } catch (error) {
    console.error('Error renaming file in tree view:', error);
    window.showErrorMessage(`Failed to rename file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to refresh the notebooks webview
async function refreshNotebooksView(): Promise<void> {
  try {
    // Focus the notebooks view first
    await commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
    await commands.executeCommand('codebook-md-notebooks-view.focus');

    // Execute the refresh command - this will trigger the refresh handler in the webview
    await commands.executeCommand('codebook-md.refreshNotebooksView');
  } catch (error) {
    console.error('Error refreshing notebooks view:', error);
  }
}

export function rawToNotebookCellData(data: codebook.RawNotebookCell): NotebookCellData {
  return <NotebookCellData>{
    kind: data.kind,
    languageId: data.language,
    metadata: {
      leadingWhitespace: data.leadingWhitespace,
      trailingWhitespace: data.trailingWhitespace,
      indentation: data.indentation
    },
    outputs: data.outputs || [],
    value: data.content,
  };
}

class MarkdownProvider implements NotebookSerializer {
  deserializeNotebook(data: Uint8Array, token: CancellationToken): NotebookData | Thenable<NotebookData> {
    if (token.isCancellationRequested) {
      return Promise.resolve({ cells: [] });
    }
    const content = Buffer.from(data).toString('utf8');
    const cellRawData = codebook.parseMarkdown(content);
    const cells = cellRawData.map(rawToNotebookCellData);
    return {
      cells
    };
  }

  serializeNotebook(data: NotebookData, token: CancellationToken): Uint8Array | Thenable<Uint8Array> {
    if (token.isCancellationRequested) {
      return Promise.resolve(new Uint8Array());
    }
    return Buffer.from(codebook.writeCellsToMarkdown(data.cells));
  }
}

// This method is called when your extension is activated
export function activate(context: ExtensionContext) {
  // Add this line at the beginning of your activate function
  console.log("Extension activated");

  // Register the Welcome webview provider (should be first to appear at the top)
  const welcomeViewProvider = new WelcomeViewProvider(context);
  context.subscriptions.push(
    window.registerWebviewViewProvider(WelcomeViewProvider.viewType, welcomeViewProvider)
  );

  // Register the Documentation webview provider
  const documentationViewProvider = new DocumentationViewProvider(context);
  context.subscriptions.push(
    window.registerWebviewViewProvider(DocumentationViewProvider.viewType, documentationViewProvider)
  );

  // Register the Notebooks webview provider
  const notebooksViewProvider = new NotebooksViewProvider(context);
  context.subscriptions.push(
    window.registerWebviewViewProvider(NotebooksViewProvider.viewType, notebooksViewProvider)
  );

  // Add commands to show and focus webviews
  let disposable = commands.registerCommand('codebook-md.openDocumentation', async () => {
    // First show the activity bar view container
    await commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
    // Then focus the documentation view
    await commands.executeCommand('codebook-md-documentation-view.focus');
  });
  context.subscriptions.push(disposable);

  disposable = commands.registerCommand('codebook-md.openNotebooks', async () => {
    // First show the activity bar view container
    await commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
    // Then focus the notebooks view
    await commands.executeCommand('codebook-md-notebooks-view.focus');
  });
  context.subscriptions.push(disposable);

  const controller = notebooks.createNotebookController('codebook-md', 'codebook-md', 'codebook-md');
  controller.supportedLanguages = [];
  controller.executeHandler = async (cells, doc, ctrl) => {
    try {
      if (cells.length > 1) {
        await kernel.executeCells(doc, cells, ctrl);
      } else {
        await kernel.executeCell(doc, cells[0], ctrl);
      }
    } catch (error) {
      console.error("Error executing cells:", error);
    }
  };

  const notebookSettings = {
    transientOutputs: true,
    transientCellMetadata: {
      inputCollapsed: true,
      outputCollapsed: true,
    }
  };

  context.subscriptions.push(workspace.registerNotebookSerializer('codebook-md', new MarkdownProvider(), notebookSettings));

  // Create an instance of a notebook editor provider, for setting up toolbar icons
  const notebookCellStatusBarItemProvider = notebooks.registerNotebookCellStatusBarItemProvider(
    'codebook-md',
    {
      provideCellStatusBarItems: (cell: NotebookCell) => {
        if (cell.document.languageId) {
          // Use undefined for alignment as a workaround
          // VS Code API will handle it correctly
          return [{
            text: '$(gear)',
            tooltip: 'Configure Code Block',
            command: {
              title: 'Configure Code Block',
              command: 'codebook-md.openCodeBlockConfig',
              arguments: [cell]
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            alignment: undefined as any // This forces TypeScript to accept our object shape
          }];
        }
        return [];
      }
    }
  );
  context.subscriptions.push(notebookCellStatusBarItemProvider);

  // Register command to open config modal
  disposable = commands.registerCommand('codebook-md.openCodeBlockConfig', async (cell) => {
    console.log('Opening code block configuration');
    if (!cell) {
      cell = window.activeNotebookEditor?.notebook.cellAt(window.activeNotebookEditor.selection.start);
      if (!cell) {
        window.showWarningMessage('No active code block selected.');
        return;
      }
    }

    // Get the current cell's output configuration
    const execCell = codebook.NewExecutableCell(cell);
    if (!execCell) {
      window.showWarningMessage('No executable cell found.');
      return;
    }
    // Open config modal with the current configuration
    configModal.openConfigModal(execCell, context);
  });

  context.subscriptions.push(disposable);

  // hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
  // is not a markdown file
  context.subscriptions.push(languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, new codebook.CellHover()));

  // add the codebook-md.openFileAtLine command
  disposable = commands.registerCommand('codebook-md.openFileAtLine', async (fileLoc: string, currentFileLoc: string) => {
    console.log(`called codebook-md.openFileAtLine | fileLoc: ${fileLoc} | currentFileLoc: ${currentFileLoc}`);
    const doc = codebook.newCodeDocumentFromFileLoc(fileLoc, currentFileLoc);
    if (!fs.existsSync(doc.fileLoc)) {
      console.error(`\tfile not found: ${doc.fileLoc}`);
      return;
    }

    console.log(`Opening file ${doc.relativeFileLoc} at line ${doc.lineBegin}`);
    doc.openAndNavigate();
  });

  context.subscriptions.push(disposable);

  // add the codebook-md.helloGo command
  disposable = commands.registerCommand('codebook-md.helloGo', async () => {
    console.log('called codebook-md.helloGo');
    codebook.helloLanguage('go', 'macos');
  });

  // add "CodebookMD" to the status bar that opens the settings for the extension
  const statusBarIcon = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  statusBarIcon.text = 'CodebookMD';
  statusBarIcon.command = 'codebook-md.openSettings';
  statusBarIcon.show();

  context.subscriptions.push(statusBarIcon);

  // add the codebook-md.openSettings command
  disposable = commands.registerCommand('codebook-md.openSettings', async () => {
    console.log('called codebook-md.openSettings');
    commands.executeCommand('workbench.action.openSettings', '@ext:josephbergevin.codebook-md');
  });

  context.subscriptions.push(disposable);

  // Register the command to open the tree view
  disposable = commands.registerCommand('codebook-md.openTreeView', () => {
    commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
  });
  context.subscriptions.push(disposable);

  // Register the command to open a markdown file with preview
  disposable = commands.registerCommand('codebook-md.openMarkdownFile', (filePath: string) => {
    const workspacePath = config.getWorkspaceFolder();
    if (!workspacePath) {
      window.showErrorMessage('No workspace folder found');
      return;
    }

    // If the path is relative, resolve it against the workspace folder
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);

    // Create URI from the resolved path
    const uri = Uri.file(absolutePath);
    console.log(`Opening file: ${absolutePath}`);

    // Check if file exists before trying to open it
    if (!fs.existsSync(absolutePath)) {
      window.showErrorMessage(`File not found: ${filePath}`);
      return;
    }

    // Open the markdown file directly in the notebook editor
    commands.executeCommand('vscode.openWith', uri, 'codebook-md');
  });
  context.subscriptions.push(disposable);

  // Register the command to open a markdown preview
  disposable = commands.registerCommand('codebook-md.openMarkdownPreview', (uri: Uri) => {
    commands.executeCommand('markdown.showPreview', uri);
  });
  context.subscriptions.push(disposable);

  // Command: Add a markdown file to tree view via file picker and folder selection
  disposable = commands.registerCommand('codebook-md.addFileToChosenFolder', async () => {
    // Get current folders from configuration
    const configPath = config.getCodebookConfigFilePath();
    const folderGroup = folders.getWorkspaceFolderGroup(configPath);

    // Create folder options for quickpick
    const folderOptions = folderGroup.folders.map(folder => ({
      label: folder.name,
      description: folder.name,
    }));

    // Show folder picker
    const selectedFolder = await window.showQuickPick(folderOptions, {
      placeHolder: 'Select a folder to add the file to',
      title: 'Choose Folder'
    });

    if (!selectedFolder) {
      return; // User canceled folder selection
    }

    // Show file picker
    const uris = await window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Markdown: ['md', 'markdown']
      },
      title: 'Select Markdown File to Add'
    });

    if (!uris || uris.length === 0) {
      return; // User canceled file selection
    }

    // Call addFileToTreeViewFolder which already uses config.getFullPath()
    await addFileToTreeViewFolder(folderGroup, uris[0].fsPath, selectedFolder.label);
  });
  context.subscriptions.push(disposable);

  // Command: Rename folder in My Notebooks webview
  disposable = commands.registerCommand('codebook-md.renameFolderInMyNotebooks', async (folderName: string) => {
    try {
      // Get new display name from user
      const newName = await window.showInputBox({
        placeHolder: folderName,
        prompt: 'Enter a new display name for this folder',
        value: folderName
      });

      if (!newName || newName === folderName) {
        return; // User canceled or no change
      }

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // Find the folder entry by its name
      const folder = folderGroup.findFolder(folderName);
      if (!folder) {
        window.showErrorMessage(`Folder ${folderName} not found`);
        return;
      }

      // Update the folder's display name
      folder.name = newName;

      // Update settings
      folderGroup.applyChanges();
      window.showInformationMessage(`Renamed folder to: ${newName}`);
    } catch (error) {
      console.error('Error renaming folder:', error);
      window.showErrorMessage(`Failed to rename folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Add subfolder to folder in My Notebooks webview
  disposable = commands.registerCommand('codebook-md.addSubFolderToMyNotebooksFolder', async (folderName: string) => {
    try {
      // Get the display name for the new sub-folder from user
      const subFolderName = await window.showInputBox({
        placeHolder: 'Sub-folder name',
        prompt: 'Enter a name for the new sub-folder',
        value: ''
      }) || '';

      if (subFolderName === '') {
        return; // User canceled
      }

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // Find the parent folder by name
      const parentFolder = folderGroup.findFolder(folderName);
      if (!parentFolder) {
        window.showErrorMessage(`Folder ${folderName} not found`);
        return;
      }

      // Initialize folders array if it doesn't exist
      if (!parentFolder.folders) {
        parentFolder.folders = [];
      }

      // Add new subfolder
      parentFolder.folders.push(new folders.FolderGroupFolder(subFolderName));

      // Update settings
      folderGroup.applyChanges();
      window.showInformationMessage(`Added sub-folder "${subFolderName}" to "${folderName}"`);
    } catch (error) {
      console.error('Error adding sub-folder:', error);
      window.showErrorMessage(`Failed to add sub-folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Add file to folder in My Notebooks webview
  disposable = commands.registerCommand('codebook-md.addFileToMyNotebooksFolder', async (folderName: string) => {
    try {
      // Show file picker
      const uris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          Markdown: ['md', 'markdown']
        },
        title: 'Select Markdown File to Add'
      });

      if (!uris || uris.length === 0) {
        return; // User canceled
      }

      const filePath = uris[0].fsPath;
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);
      await addFileToTreeViewFolder(folderGroup, filePath, folderName);
    } catch (error) {
      console.error('Error adding file to folder:', error);
      window.showErrorMessage(`Failed to add file to folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Remove folder from My Notebooks webview
  disposable = commands.registerCommand('codebook-md.removeFolderFromMyNotebooksFolder', async (folderName: string) => {
    try {
      // Ask for confirmation
      const answer = await window.showWarningMessage(
        `Are you sure you want to remove the folder "${folderName}" and all its contents?`,
        { modal: true },
        'Yes',
        'No'
      );

      if (answer !== 'Yes') {
        return; // User canceled
      }

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // Find and remove the folder and any sub-folders
      const removeFolder = (folders: folders.FolderGroupFolder[]): boolean => {
        for (let i = 0; i < folders.length; i++) {
          if (folders[i].name === folderName) {
            folders.splice(i, 1);
            return true;
          }
          const subFolders = folders[i].folders;
          if (subFolders && subFolders.length > 0) {
            if (removeFolder(subFolders)) {
              return true;
            }
          }
        }
        return false;
      };

      if (!removeFolder(folderGroup.folders)) {
        window.showErrorMessage(`Folder "${folderName}" not found`);
        return;
      }

      // Update settings
      folderGroup.applyChanges();
      window.showInformationMessage(`Removed folder "${folderName}" and its contents`);
    } catch (error) {
      console.error('Error removing folder:', error);
      window.showErrorMessage(`Failed to remove folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Remove file from My Notebooks folder
  disposable = commands.registerCommand('codebook-md.removeFileFromMyNotebooksFolder', async (entry: folders.FolderGroupFile) => {
    try {
      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);
      const workspacePath = config.getWorkspaceFolder();
      let fileRemoved = false;

      // Find and remove the file from its folder
      const removeFile = (folders: folders.FolderGroupFolder[]): boolean => {
        for (const folder of folders) {
          if (folder.files) {
            const fileIndex = folder.files.findIndex(f =>
              f.name === entry.name && config.getFullPath(f.path, workspacePath) === config.getFullPath(entry.path, workspacePath) && f.path === entry.path);

            if (fileIndex !== -1) {
              folder.files.splice(fileIndex, 1);
              fileRemoved = true;
              return true;
            }
          }
          if (folder.folders) {
            if (removeFile(folder.folders)) {
              return true;
            }
          }
        }
        return false;
      };

      removeFile(folderGroup.folders);

      if (!fileRemoved) {
        window.showWarningMessage('File not found');
        return;
      }

      // Update settings
      folderGroup.applyChanges();
      window.showInformationMessage(`Removed "${entry.name}" from My Notebooks`);
    } catch (error) {
      console.error('Error removing file:', error);
      window.showErrorMessage(`Failed to remove file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Rename file in My Notebooks webview
  disposable = commands.registerCommand('codebook-md.renameFileInMyNotebooks', async (entry: folders.FolderGroupFile) => {
    try {
      // Get new name from user
      const newName = await window.showInputBox({
        placeHolder: entry.name,
        prompt: 'Enter a new name for this file',
        value: entry.name
      });

      if (!newName || newName === entry.name) {
        return; // User canceled or no change
      }

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);
      const workspacePath = config.getWorkspaceFolder();
      let fileRenamed = false;

      // Find and rename the file in its folder
      const renameFile = (folders: folders.FolderGroupFolder[]): boolean => {
        for (const folder of folders) {
          if (folder.files) {
            const fileIndex = folder.files.findIndex(f =>
              f.name === entry.name && config.getFullPath(f.path, workspacePath) === config.getFullPath(entry.path, workspacePath));

            if (fileIndex !== -1) {
              folder.files[fileIndex] = {
                ...folder.files[fileIndex],
                name: newName
              };
              fileRenamed = true;
              return true;
            }
          }
          if (folder.folders) {
            if (renameFile(folder.folders)) {
              return true;
            }
          }
        }
        return false;
      };

      renameFile(folderGroup.folders);

      if (!fileRenamed) {
        window.showWarningMessage('File not found');
        return;
      }

      // Update settings
      folderGroup.applyChanges();
      window.showInformationMessage(`Renamed file to: ${newName}`);
    } catch (error) {
      console.error('Error renaming file:', error);
      window.showErrorMessage(`Failed to rename file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Remove object (file or folder) from tree view based on index ID
  disposable = commands.registerCommand('codebook-md.removeObjectFromTreeView', async (objectId: string) => {
    try {
      console.log(`Removing object with ID: ${objectId} from tree view`);

      // Ask for confirmation
      const answer = await window.showWarningMessage(
        `Are you sure you want to remove this item from My Notebooks?`,
        { modal: true },
        'Yes',
        'No'
      );
      if (answer !== 'Yes') {
        return; // User canceled
      }

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // Determine if this is a file or folder ID
      // File IDs contain square brackets, e.g., "0.1[2]"
      // Folder IDs are dot-separated numbers, e.g., "0.1.2"
      const isFile = objectId.includes('[');

      if (isFile) {
        // Handle file removal
        // Extract folder path and file index from the objectId
        // Format: "folderIndex[fileIndex]", e.g., "0.1[2]"
        const matches = objectId.match(/(.+)\[(\d+)\]/);
        if (!matches || matches.length !== 3) {
          window.showErrorMessage(`Invalid file ID format: ${objectId}`);
          return;
        }

        const folderPath = matches[1]; // "0.1"
        const fileIndex = parseInt(matches[2], 10); // 2

        // Navigate to the folder using the folderPath
        let currentFolders = folderGroup.folders;
        const folderIndices = folderPath.split('.').map(index => parseInt(index, 10));
        let targetFolder: folders.FolderGroupFolder | undefined;

        // Navigate to the target folder
        try {
          for (const index of folderIndices) {
            if (index >= currentFolders.length) {
              throw new Error(`Folder index out of bounds: ${index}`);
            }
            targetFolder = currentFolders[index];
            if (!targetFolder) {
              throw new Error(`Folder not found at index: ${index}`);
            }
            currentFolders = targetFolder.folders || [];
          }
        } catch (error) {
          window.showErrorMessage(`Failed to find folder: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }

        // Remove the file at the specified index
        if (targetFolder && targetFolder.files && fileIndex < targetFolder.files.length) {
          const fileName = targetFolder.files[fileIndex].name;
          targetFolder.files.splice(fileIndex, 1);
          window.showInformationMessage(`Removed "${fileName}" from My Notebooks`);
        } else {
          window.showErrorMessage(`File not found at index ${fileIndex}`);
          return;
        }
      } else {
        // Handle folder removal
        // The objectId is the folder path, e.g., "0.1.2"
        const folderIndices = objectId.split('.').map(index => parseInt(index, 10));

        // Special case for top-level folder
        if (folderIndices.length === 1) {
          const index = folderIndices[0];
          if (index >= folderGroup.folders.length) {
            window.showErrorMessage(`Folder index out of bounds: ${index}`);
            return;
          }
          const folderName = folderGroup.folders[index].name;
          folderGroup.folders.splice(index, 1);
          window.showInformationMessage(`Removed folder "${folderName}" and its contents`);
        } else {
          // For nested folders, we need to find the parent folder
          const parentFolderIndices = folderIndices.slice(0, -1);
          const folderIndex = folderIndices[folderIndices.length - 1];

          // Navigate to the parent folder
          let currentFolders = folderGroup.folders;
          let parentFolder: folders.FolderGroupFolder | undefined;

          try {
            for (const index of parentFolderIndices) {
              if (index >= currentFolders.length) {
                throw new Error(`Folder index out of bounds: ${index}`);
              }
              parentFolder = currentFolders[index];
              if (!parentFolder) {
                throw new Error(`Folder not found at index: ${index}`);
              }
              currentFolders = parentFolder.folders || [];
            }
          } catch (error) {
            window.showErrorMessage(`Failed to find parent folder: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }

          // Remove the folder at the specified index
          if (parentFolder && parentFolder.folders && folderIndex < parentFolder.folders.length) {
            const folderName = parentFolder.folders[folderIndex].name;
            parentFolder.folders.splice(folderIndex, 1);
            window.showInformationMessage(`Removed folder "${folderName}" and its contents`);
          } else {
            window.showErrorMessage(`Folder not found at index ${folderIndex}`);
            return;
          }
        }
      }

      // Update settings
      folderGroup.applyChanges();

      // Force a refresh of the notebooks view
      await refreshNotebooksView();
    } catch (error) {
      console.error('Error removing object from tree view:', error);
      window.showErrorMessage(`Failed to remove object: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Move item up in tree view
  disposable = commands.registerCommand('codebook-md.moveTreeViewItemUp', async (objectId: string) => {
    try {
      console.log(`Moving item with ID: ${objectId} up in tree view`);

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // move the item up using the objectId
      const success = folderGroup.moveTreeViewItemUp(objectId);
      if (!success) {
        console.log(`Item with ID ${objectId} not moved up`);
        return;
      }

      // Update settings
      folderGroup.applyChanges();

      // Force a refresh of the notebooks view
      await refreshNotebooksView();
    } catch (error) {
      console.error('Error moving item up in tree view:', error);
      window.showErrorMessage(`Failed to move item up: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Move item down in tree view
  disposable = commands.registerCommand('codebook-md.moveTreeViewItemDown', async (objectId: string) => {
    try {
      console.log(`Moving item with ID: ${objectId} down in tree view`);

      // Get current folders from configuration
      const configPath = config.getCodebookConfigFilePath();
      const folderGroup = folders.getWorkspaceFolderGroup(configPath);

      // move the item down using the objectId
      const success = folderGroup.moveTreeViewItemDown(objectId);
      if (!success) {
        console.log(`Item with ID ${objectId} not moved down`);
        return;
      }

      // Update settings
      folderGroup.applyChanges();
    } catch (error) {
      console.error('Error moving item down in tree view:', error);
      window.showErrorMessage(`Failed to move item down: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Add folder to tree view
  disposable = commands.registerCommand('codebook-md.addFolderToTreeView', async () => {
    await addFolderToTreeView();
  });
  context.subscriptions.push(disposable);

  // Register command to refresh the notebooks view
  disposable = commands.registerCommand('codebook-md.refreshNotebooksView', () => {
    // Find the notebooks view provider and trigger a refresh
    if (notebooksViewProvider) {
      console.log("refreshing notebooks view");
      notebooksViewProvider.updateWebview();
    }
  });
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }

// Export helper functions
export {
  addFileToTreeViewFolder,
  addFolderToTreeView,
  addSubFolder,
  renameFolderDisplay,
  removeFolderFromTreeView,
  renameTreeViewFile
};
