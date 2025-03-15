import {
  languages, commands, window, notebooks, workspace,
  ExtensionContext, StatusBarAlignment, ProviderResult,
  NotebookSerializer, NotebookData, NotebookCellData, CancellationToken,
  TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri, EventEmitter, Event,
} from 'vscode';

import { Kernel } from './kernel';
import * as codebook from './codebook';
import * as fs from 'fs';
import * as config from './config';
import * as path from 'path';
import { ThemeIcon } from 'vscode';
import { NotebooksViewProvider } from './webview/notebooksView';

const kernel = new Kernel();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  // Create and register the TreeDataProvider for the view
  const treeDataProvider = new MarkdownFileTreeDataProvider();
  const treeView = window.createTreeView('codebook-md-view', { treeDataProvider });
  context.subscriptions.push(treeView);

  // Register the Notebooks webview provider
  const notebooksViewProvider = new NotebooksViewProvider(context);
  context.subscriptions.push(
    window.registerWebviewViewProvider(NotebooksViewProvider.viewType, notebooksViewProvider)
  );

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

  // hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
  // is not a markdown file
  context.subscriptions.push(languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, new codebook.CellHover()));

  // add the codebook-md.openFileAtLine command
  let disposable = commands.registerCommand('codebook-md.openFileAtLine', async (fileLoc: string, currentFileLoc: string) => {
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

  // Register the command to manually refresh the tree view
  disposable = commands.registerCommand('codebook-md.refreshTreeView', () => {
    treeDataProvider.refresh();
    window.showInformationMessage('Tree view refreshed');
  });
  context.subscriptions.push(disposable);

  // Register the command to open a markdown file with preview
  disposable = commands.registerCommand('codebook-md.openMarkdownFile', (filePath: string) => {
    const uri = Uri.file(filePath);

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
    // Get the folders from configuration
    const configuration = workspace.getConfiguration('codebook-md');
    const treeViewConfig = configuration.get<{ folders: config.TreeViewFolderEntry[]; }>('treeView') || { folders: [] };

    // Create folder options for quickpick
    const folderOptions = treeViewConfig.folders.map(folder => ({
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

    // Use addFileToFolder to add the file to the selected folder
    await addFileToTreeViewFolder(uris[0].fsPath, selectedFolder.description);
    treeDataProvider.refresh(); // Auto-refresh after adding
  });
  context.subscriptions.push(disposable);

  // Command: Remove a markdown file from tree view
  disposable = commands.registerCommand('codebook-md.removeFromFavorites', async (item: MarkdownFileTreeItem) => {
    if (!item || !item.entry) {
      return;
    }

    await removeFileFromTreeView(item.entry);
    treeDataProvider.refresh(); // Auto-refresh after removing
  });
  context.subscriptions.push(disposable);

  // Command: Rename a file in the tree view
  disposable = commands.registerCommand('codebook-md.renameTreeViewFile', async (item: MarkdownFileTreeItem) => {
    if (!item || !item.entry) {
      return;
    }

    // Get new name from user
    const newName = await window.showInputBox({
      placeHolder: item.entry.name,
      prompt: 'Enter a new name for this file',
      value: item.entry.name
    });

    if (!newName || newName === item.entry.name) {
      return; // User canceled or no change
    }

    await renameTreeViewFile(item.entry, newName);
    treeDataProvider.refresh(); // Refresh the view to show the change
  });
  context.subscriptions.push(disposable);

  // Command: Add file to a specific folder
  disposable = commands.registerCommand('codebook-md.addFileToFolder', async (item: MarkdownFileTreeItem) => {
    // Get the folder path from the item
    const folderPath = item.label as string;

    if (!folderPath) {
      window.showErrorMessage('Invalid folder path');
      return;
    }

    const uris = await window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Markdown: ['md', 'markdown']
      },
      title: 'Select Markdown File to Add to Folder'
    });

    if (!uris || uris.length === 0) {
      return;
    }

    // Add the file directly to the specified folder path
    await addFileToTreeViewFolder(uris[0].fsPath, folderPath);
    treeDataProvider.refresh(); // Auto-refresh after adding
  });
  context.subscriptions.push(disposable);

  // Listen for configuration changes to update the tree view
  context.subscriptions.push(workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('codebook-md.treeView.files') ||
      e.affectsConfiguration('codebook-md.treeView.folders')) {
      treeDataProvider.refresh();
    }
  }));

  // Watch for changes in .vscode/settings.json
  const settingsWatcher = workspace.createFileSystemWatcher('**/.vscode/settings.json');
  settingsWatcher.onDidChange(() => treeDataProvider.refresh());
  settingsWatcher.onDidCreate(() => treeDataProvider.refresh());
  settingsWatcher.onDidDelete(() => treeDataProvider.refresh());
  context.subscriptions.push(settingsWatcher);

  // Listen for file changes in the workspace to update the tree view
  const watcher = workspace.createFileSystemWatcher('**/*.md');

  // When files are created, check if they should be refreshed in the tree
  watcher.onDidCreate(() => {
    treeDataProvider.refresh();
  });

  // When files are deleted, check if they should be refreshed in the tree
  watcher.onDidDelete(() => {
    treeDataProvider.refresh();
  });

  // When files are changed, refresh the tree to ensure any name changes are reflected
  watcher.onDidChange(() => {
    treeDataProvider.refresh();
  });

  context.subscriptions.push(watcher);

  // Command: Add a folder to tree view
  disposable = commands.registerCommand('codebook-md.addFolderToTreeView', async () => {
    await addFolderToTreeView();
    treeDataProvider.refresh(); // Auto-refresh after adding
  });
  context.subscriptions.push(disposable);

  // Command: Add a subfolder to an existing folder
  disposable = commands.registerCommand('codebook-md.addSubFolder', async (item: MarkdownFileTreeItem) => {
    // Get the folder path from the item
    const folderPath = item.label as string;

    if (!folderPath) {
      window.showErrorMessage('Invalid folder path');
      return;
    }

    await addSubFolder(folderPath);
    treeDataProvider.refresh(); // Auto-refresh after adding
  });
  context.subscriptions.push(disposable);

  // Command: Rename folder display name
  disposable = commands.registerCommand('codebook-md.renameFolderDisplay', async (item: MarkdownFileTreeItem) => {
    // Get the folder path from the item
    const folderPath = item.label as string;

    if (!folderPath) {
      window.showErrorMessage('Invalid folder path');
      return;
    }

    await renameFolderDisplay(folderPath, item.label as string);
    treeDataProvider.refresh(); // Refresh the view to show the change
  });
  context.subscriptions.push(disposable);

  // Command: Remove folder from tree view
  disposable = commands.registerCommand('codebook-md.removeFolderFromTreeView', async (item: MarkdownFileTreeItem) => {
    const folderPath = item.label as string;
    if (!folderPath) {
      window.showErrorMessage('Invalid folder path');
      return;
    }

    // Ask for confirmation before removing
    const answer = await window.showWarningMessage(
      `Are you sure you want to remove the folder "${item.label}" and all its contents from the tree view?`,
      { modal: true },
      'Yes',
      'No'
    );

    if (answer !== 'Yes') {
      return;
    }

    await removeFolderFromTreeView(folderPath);
    treeDataProvider.refresh();
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
      const treeViewFolders = config.getTreeViewFolders();

      // Find the folder entry by its name
      const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
        for (const folder of folders) {
          if (folder.name === name) {
            return folder;
          }
          if (folder.folders) {
            const found = findFolder(folder.folders, name);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      };

      const folder = findFolder(treeViewFolders, folderName);
      if (!folder) {
        window.showErrorMessage(`Folder ${folderName} not found`);
        return;
      }

      // Update the folder's display name
      folder.name = newName;

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
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
      });

      if (!subFolderName) {
        return; // User canceled
      }

      // Get current folders from configuration
      const treeViewFolders = config.getTreeViewFolders();

      // Find the parent folder by name
      const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
        for (const folder of folders) {
          if (folder.name === name) {
            return folder;
          }
          if (folder.folders) {
            const found = findFolder(folder.folders, name);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      };

      const parentFolder = findFolder(treeViewFolders, folderName);
      if (!parentFolder) {
        window.showErrorMessage(`Folder ${folderName} not found`);
        return;
      }

      // Initialize folders array if it doesn't exist
      if (!parentFolder.folders) {
        parentFolder.folders = [];
      }

      // Add new subfolder
      parentFolder.folders.push({
        name: subFolderName,
        files: []
      });

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
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
      const fileName = path.basename(filePath);

      // Get display name from user
      const displayName = await window.showInputBox({
        placeHolder: fileName,
        prompt: 'Enter a display name for this markdown file',
        value: fileName
          .replace(/\.\w+$/, '') // Remove extension
          .split(/[_\-\s]/) // Split by underscore, dash, or space
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter of each word
          .join(' ') // Join with spaces
      });

      if (!displayName) {
        return; // User canceled
      }

      // Get current folders from configuration
      const treeViewFolders = config.getTreeViewFolders();

      // Find the target folder by name
      const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
        for (const folder of folders) {
          if (folder.name === name) {
            return folder;
          }
          if (folder.folders) {
            const found = findFolder(folder.folders, name);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      };

      const targetFolder = findFolder(treeViewFolders, folderName);
      if (!targetFolder) {
        window.showErrorMessage(`Folder ${folderName} not found`);
        return;
      }

      // Initialize files array if it doesn't exist
      if (!targetFolder.files) {
        targetFolder.files = [];
      }

      // Convert to relative path if possible
      const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
      let relativePath = filePath;
      if (workspacePath && filePath.startsWith(workspacePath)) {
        relativePath = path.relative(workspacePath, filePath);
      }

      // Add new file entry
      targetFolder.files.push({
        name: displayName,
        path: relativePath
      });

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
      window.showInformationMessage(`Added file "${displayName}" to folder "${folderName}"`);
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
      const treeViewFolders = config.getTreeViewFolders();

      // Find and remove the folder and any sub-folders
      const removeFolder = (folders: config.TreeViewFolderEntry[]): boolean => {
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

      if (!removeFolder(treeViewFolders)) {
        window.showErrorMessage(`Folder "${folderName}" not found`);
        return;
      }

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
      window.showInformationMessage(`Removed folder "${folderName}" and its contents`);
    } catch (error) {
      console.error('Error removing folder:', error);
      window.showErrorMessage(`Failed to remove folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Remove file from My Notebooks folder
  disposable = commands.registerCommand('codebook-md.removeFileFromMyNotebooksFolder', async (entry: config.TreeViewFileEntry) => {
    try {
      // Get current folders from configuration
      const treeViewFolders = config.getTreeViewFolders();
      const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
      let fileRemoved = false;

      // Find and remove the file from its folder
      const removeFile = (folders: config.TreeViewFolderEntry[]): boolean => {
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

      removeFile(treeViewFolders);

      if (!fileRemoved) {
        window.showWarningMessage('File not found');
        return;
      }

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
      window.showInformationMessage(`Removed "${entry.name}" from My Notebooks`);
    } catch (error) {
      console.error('Error removing file:', error);
      window.showErrorMessage(`Failed to remove file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);

  // Command: Rename file in My Notebooks webview
  disposable = commands.registerCommand('codebook-md.renameFileInMyNotebooks', async (entry: config.TreeViewFileEntry) => {
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
      const treeViewFolders = config.getTreeViewFolders();
      const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
      let fileRenamed = false;

      // Find and rename the file in its folder
      const renameFile = (folders: config.TreeViewFolderEntry[]): boolean => {
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

      renameFile(treeViewFolders);

      if (!fileRenamed) {
        window.showWarningMessage('File not found');
        return;
      }

      // Update settings
      config.updateTreeViewSettings(treeViewFolders);
      window.showInformationMessage(`Renamed file to: ${newName}`);
    } catch (error) {
      console.error('Error renaming file:', error);
      window.showErrorMessage(`Failed to rename file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  context.subscriptions.push(disposable);
}

// Remove the `folderPath` property from the `addFileToTreeViewFolder` function
async function addFileToTreeViewFolder(filePath: string, folderName: string): Promise<void> {
  try {
    console.log(`Adding file ${filePath} to folder ${folderName}`);

    // Get display name from user
    const fileName = path.basename(filePath);
    const displayName = await window.showInputBox({
      placeHolder: fileName,
      prompt: 'Enter a display name for this markdown file',
      value: fileName
        .replace(/\.\w+$/, '') // Remove extension
        .split(/[_\-\s]/) // Split by underscore, dash, or space
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter of each word
        .join(' ') // Join with spaces
    });

    if (!displayName) {
      return; // User canceled
    }

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find or create the target folder
    const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
      for (const folder of folders) {
        if (folder.name === name) {
          return folder;
        }
        if (folder.folders) {
          const found = findFolder(folder.folders, name);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };

    const targetFolder = findFolder(treeViewFolders, folderName);
    if (!targetFolder) {
      window.showErrorMessage(`Folder ${folderName} not found`);
      return;
    }

    // Initialize files array if it doesn't exist
    if (!targetFolder.files) {
      targetFolder.files = [];
    }

    // Convert to relative path if possible
    const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
    let relativePath = filePath;
    if (workspacePath && filePath.startsWith(workspacePath)) {
      relativePath = path.relative(workspacePath, filePath);
    }

    // Check if file already exists in the folder
    const existingIndex = targetFolder.files.findIndex(f =>
      config.getFullPath(f.path, workspacePath) === filePath);

    if (existingIndex >= 0) {
      // Update existing file entry
      targetFolder.files[existingIndex] = {
        name: displayName,
        path: relativePath
      };
      window.showInformationMessage(`Updated markdown file in folder: ${displayName}`);
    } else {
      // Add new file entry
      targetFolder.files.push({
        name: displayName,
        path: relativePath
      });
      window.showInformationMessage(`Added markdown file to folder: ${displayName}`);
    }

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
  } catch (error) {
    console.error('Error adding file to folder:', error);
    window.showErrorMessage(`Failed to add file to folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Remove the `folderPath` property from the `addFolderToTreeView` function
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

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Use folderName as both display name and path for top-level folder
    const newFolder: config.TreeViewFolderEntry = {
      name: folderName,
      files: []
    };

    treeViewFolders.push(newFolder);
    window.showInformationMessage(`Added folder to tree view: ${folderName}`);

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
  } catch (error) {
    console.error('Error adding folder to tree view:', error);
    window.showErrorMessage(`Failed to add folder to tree view: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Remove the `folderPath` property from the `addSubFolder` function
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

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find the parent folder
    const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
      for (const folder of folders) {
        if (folder.name === name) {
          return folder;
        }
        if (folder.folders) {
          const found = findFolder(folder.folders, name);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };

    const parentFolder = findFolder(treeViewFolders, parentFolderName);
    if (!parentFolder) {
      window.showErrorMessage(`Parent folder ${parentFolderName} not found`);
      return;
    }

    // Initialize subfolders array if it doesn't exist
    if (!parentFolder.folders) {
      parentFolder.folders = [];
    }

    // Add new sub-folder
    const newFolder: config.TreeViewFolderEntry = {
      name: folderName,
      files: []
    };

    parentFolder.folders.push(newFolder);
    window.showInformationMessage(`Added sub-folder ${folderName} to ${parentFolderName}`);

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
  } catch (error) {
    console.error('Error adding sub-folder:', error);
    window.showErrorMessage(`Failed to add sub-folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Remove the `folderPath` property from the `renameFolderDisplay` function
async function renameFolderDisplay(folderName: string, currentDisplayName: string): Promise<void> {
  try {
    // Get new display name from user
    const newName = await window.showInputBox({
      placeHolder: currentDisplayName,
      prompt: 'Enter a new display name for this folder',
      value: currentDisplayName
    });

    if (!newName || newName === currentDisplayName) {
      return; // User canceled or no change
    }

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find the folder entry by its name
    const findFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry | undefined => {
      for (const folder of folders) {
        if (folder.name === name) {
          return folder;
        }
        if (folder.folders) {
          const found = findFolder(folder.folders, name);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };

    const folder = findFolder(treeViewFolders, folderName);
    if (!folder) {
      window.showErrorMessage(`Folder ${folderName} not found`);
      return;
    }

    // Update the folder's display name
    folder.name = newName;
    window.showInformationMessage(`Renamed folder to: ${newName}`);

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
  } catch (error) {
    console.error('Error renaming folder:', error);
    window.showErrorMessage(`Failed to rename folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Remove the `folderPath` property from the `removeFolderFromTreeView` function
async function removeFolderFromTreeView(folderName: string): Promise<void> {
  try {
    console.log(`Removing folder ${folderName} from tree view`);

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find and remove the folder and any sub-folders
    const removeFolder = (folders: config.TreeViewFolderEntry[], name: string): config.TreeViewFolderEntry[] => {
      return folders.filter(folder => {
        if (folder.name === name) {
          return false;
        }
        if (folder.folders) {
          folder.folders = removeFolder(folder.folders, name);
        }
        return true;
      });
    };

    const updatedFolders = removeFolder(treeViewFolders, folderName);

    if (updatedFolders.length === treeViewFolders.length) {
      window.showWarningMessage('Folder not found in tree view');
      return;
    }

    // Update settings
    config.updateTreeViewSettings(updatedFolders);
    window.showInformationMessage(`Removed folder from tree view`);
  } catch (error) {
    console.error('Error removing folder from tree view:', error);
    window.showErrorMessage(`Failed to remove folder from tree view: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Define the `removeFileFromTreeView` function
async function removeFileFromTreeView(entry: config.TreeViewFileEntry): Promise<void> {
  try {
    console.log(`Removing file ${entry.name} from tree view`);

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find the folder containing the file
    const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
    let fileRemoved = false;

    const removeFile = (folders: config.TreeViewFolderEntry[]): boolean => {
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

    removeFile(treeViewFolders);

    if (!fileRemoved) {
      window.showWarningMessage('File not found in tree view');
      return;
    }

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
    window.showInformationMessage(`Removed ${entry.name} from tree view`);
  } catch (error) {
    console.error('Error removing file from tree view:', error);
    window.showErrorMessage(`Failed to remove file from tree view: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Define the `renameTreeViewFile` function
async function renameTreeViewFile(entry: config.TreeViewFileEntry, newName: string): Promise<void> {
  try {
    console.log(`Renaming file from "${entry.name}" to "${newName}"`);

    // Get current folders from .vscode/settings.json
    const treeViewFolders = config.getTreeViewFolders();

    // Find the file in its folder and rename it
    const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
    let fileRenamed = false;

    const renameFile = (folders: config.TreeViewFolderEntry[]): boolean => {
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

    renameFile(treeViewFolders);

    if (!fileRenamed) {
      window.showWarningMessage('File not found in tree view');
      return;
    }

    // Update settings
    config.updateTreeViewSettings(treeViewFolders);
    window.showInformationMessage(`Renamed file to: ${newName}`);
  } catch (error) {
    console.error('Error renaming file in tree view:', error);
    window.showErrorMessage(`Failed to rename file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Represents a node in the tree view structure
class TreeNode {
  public readonly children: Map<string, TreeNode> = new Map();
  public readonly files: MarkdownFileTreeItem[] = [];

  constructor(public readonly name: string) { }

  addChild(name: string): TreeNode {
    if (!this.children.has(name)) {
      this.children.set(name, new TreeNode(name));
    }
    return this.children.get(name)!;
  }

  addFile(item: MarkdownFileTreeItem): void {
    this.files.push(item);
  }

  get isEmpty(): boolean {
    return this.children.size === 0 && this.files.length === 0;
  }
}

// Custom TreeItem class to hold markdown file data
class MarkdownFileTreeItem extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly entry?: config.TreeViewFileEntry,
    public readonly contextValue: string = 'default'
  ) {
    super(label, collapsibleState);
    this.contextValue = entry ? 'markdownFile' : this.contextValue;
  }
}

// MarkdownFileTreeDataProvider implements TreeDataProvider and provides the data for the tree view
class MarkdownFileTreeDataProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | null | void> = new EventEmitter<TreeItem | undefined | null | void>();

  readonly onDidChangeTreeData: Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Root node of the tree structure
  private rootNode: TreeNode = new TreeNode('root');
  // Flag to track if the tree structure has been built
  private treeBuilt: boolean = false;
  // Map to store custom folder configurations
  private folderConfigs: Map<string, config.TreeViewFolderEntry> = new Map();

  refresh(): void {
    // Reset the tree built flag
    this.treeBuilt = false;
    // Reset root node 
    this.rootNode = new TreeNode('root');
    // Clear folder configs
    this.folderConfigs.clear();
    // Emit the event to notify VS Code that the tree data has changed
    // Using undefined explicitly notifies all nodes to refresh
    this._onDidChangeTreeData.fire(undefined);
    console.log('Tree view refresh triggered with full rebuild');
  }

  // Update the `buildTreeStructure` method to handle the new nested folder structure
  private buildTreeStructure(): void {
    console.log('Building tree structure');
    this.rootNode = new TreeNode('root');
    this.folderConfigs.clear();

    const treeViewFolders = config.getTreeViewFolders();

    const processFolder = (folderEntry: config.TreeViewFolderEntry, parentNode: TreeNode) => {
      const currentNode = parentNode.addChild(folderEntry.name);
      this.folderConfigs.set(folderEntry.name, folderEntry);

      if (folderEntry.files) {
        const workspacePath = config.readConfig().rootPath || workspace.workspaceFolders?.[0].uri.fsPath || '';
        for (const fileEntry of folderEntry.files) {
          const fullPath = config.getFullPath(fileEntry.path, workspacePath);
          const fileExists = fs.existsSync(fullPath);
          const fileItem = new MarkdownFileTreeItem(fileEntry.name, TreeItemCollapsibleState.None, fileEntry);
          fileItem.tooltip = fullPath;

          if (fileExists) {
            fileItem.command = {
              command: 'codebook-md.openMarkdownFile',
              title: 'Open Markdown File',
              arguments: [fullPath]
            };
            fileItem.description = path.basename(fullPath);
            fileItem.iconPath = new ThemeIcon('markdown');
          } else {
            fileItem.description = '(not found)';
            fileItem.tooltip += ' - File not found';
            fileItem.iconPath = new ThemeIcon('warning');
          }

          currentNode.addFile(fileItem);
        }
      }

      if (folderEntry.folders) {
        for (const subFolder of folderEntry.folders) {
          processFolder(subFolder, currentNode);
        }
      }
    };

    for (const folderEntry of treeViewFolders) {
      processFolder(folderEntry, this.rootNode);
    }

    this.treeBuilt = true;
  }

  getTreeItem(element: TreeItem): TreeItem | Thenable<TreeItem> {
    return element;
  }

  getChildren(element?: TreeItem): ProviderResult<TreeItem[]> {
    // If tree structure not built or a refresh has been triggered, rebuild it
    if (!this.treeBuilt) {
      this.buildTreeStructure();
    }

    // If we're at the root level
    if (!element) {
      const items: TreeItem[] = [];

      // Add Tree View Documentation section
      const treeViewTitle = new MarkdownFileTreeItem('Welcome to Tree View', TreeItemCollapsibleState.Collapsed, undefined, 'documentation');
      items.push(treeViewTitle);

      // Add How-to Section
      const howToSection = new MarkdownFileTreeItem('Tree View: Adding Folders and Files', TreeItemCollapsibleState.Collapsed, undefined, 'documentation');
      items.push(howToSection);

      // Add tree structure items - only top-level folders and files
      for (const [name, childNode] of this.rootNode.children) {
        const hasChildren = childNode.children.size > 0 || childNode.files.length > 0;

        // Check if we have a custom configuration for this folder
        const folderConfig = this.folderConfigs.get(name);

        const folderItem = new MarkdownFileTreeItem(
          folderConfig?.name || name, // Use customized name if available
          hasChildren ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
          undefined,
          'folder'
        );

        // Set custom folder icon if specified, otherwise use default
        if (folderConfig?.icon && fs.existsSync(folderConfig.icon)) {
          folderItem.iconPath = Uri.file(folderConfig.icon);
        } else {
          folderItem.iconPath = ThemeIcon.Folder;
        }

        // Store folder path in description to track hierarchy
        folderItem.description = name;
        items.push(folderItem);
      }

      // Add direct root files if any
      items.push(...this.rootNode.files);

      return items;
    }
    // If we're looking at the main Tree View Folders section
    else if (element.label === 'Welcome to Tree View') {
      const items: TreeItem[] = [];

      // Add sections
      const description = new MarkdownFileTreeItem('Tree View', TreeItemCollapsibleState.None);
      description.tooltip = 'Tree View';
      description.description = 'Features:';
      items.push(description);

      // Add bullet points as separate items for better readability
      const bulletPoints = [
        'Organize .md files into virtual folders',
        'Create custom folder hierarchies for easy navigation',
        'Add frequently used notebooks to specific folders',
        'Rename files and folders with custom display names',
        'Access your important documents with one click'
      ];

      bulletPoints.forEach(point => {
        const bulletItem = new MarkdownFileTreeItem(`• ${point}`, TreeItemCollapsibleState.None);
        items.push(bulletItem);
      });

      return items;
    }
    // If we're looking at the How-to section
    else if (element.label === 'Tree View: Adding Folders and Files') {
      const items: TreeItem[] = [];

      // Add sections
      const description = new MarkdownFileTreeItem(
        'The Tree View feature allows you to create virtual folders to organize your markdown files. ' +
        'You can add files to these folders, making it easier to navigate and manage your workspace.',
        TreeItemCollapsibleState.None
      );
      items.push(description);

      // Virtual Folders section
      const addFoldersSection = new MarkdownFileTreeItem('How to Add Virtual Folders', TreeItemCollapsibleState.None);
      items.push(addFoldersSection);
      items.push(new MarkdownFileTreeItem('1. Click on the New Folder icon above the Tree View.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('2. Enter the display name of the folder.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('   Example: "Animals"', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('3. The virtual folder will be added to the top-level of the Tree View.', TreeItemCollapsibleState.None));

      // Sub-folders section
      const subFoldersSection = new MarkdownFileTreeItem('How to add Sub-Folders', TreeItemCollapsibleState.None);
      items.push(subFoldersSection);
      items.push(new MarkdownFileTreeItem('1. Right-click on the folder you want to add a sub-folder to.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('2. Select "Add Sub-Folder" from the context menu.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('3. Enter the display name of the sub-folder.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('   Example: "Dogs"', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('4. The sub-folder will be added to the selected folder in the Tree View.', TreeItemCollapsibleState.None));

      // Add files section
      const addFilesSection = new MarkdownFileTreeItem('How to Add Files to Folders', TreeItemCollapsibleState.None);
      items.push(addFilesSection);
      items.push(new MarkdownFileTreeItem('1. Right-click on the folder you want to add a file to.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('2. Select "Add File" from the context menu.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('3. Enter the display name of the file.', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('   Example: "Dog Breeds"', TreeItemCollapsibleState.None));
      items.push(new MarkdownFileTreeItem('4. The file will be added to the selected folder in the Tree View.', TreeItemCollapsibleState.None));

      return items;
    }
    // If we're looking at children of a folder item
    else if ((element as MarkdownFileTreeItem).contextValue === 'folder') {
      // Get the folder's path from its description
      const folderPath = (element as MarkdownFileTreeItem).description as string;
      // Find the node that matches this folder path
      const node = this.findNodeByPath(folderPath);

      if (!node) {
        return [];
      }

      const items: TreeItem[] = [];

      // Add child folders first
      for (const [childName, childNode] of node.children) {
        const hasChildren = childNode.children.size > 0 || childNode.files.length > 0;
        const childPath = folderPath ? `${folderPath}.${childName}` : childName;

        // Check if we have a custom configuration for this folder
        const folderConfig = this.folderConfigs.get(childPath);

        // Skip this folder if it's configured to be hidden
        if (folderConfig?.hide) {
          continue;
        }

        const folderItem = new MarkdownFileTreeItem(
          folderConfig?.name || childName, // Use customized name if available
          hasChildren ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
          undefined,
          'folder'
        );

        // Set custom folder icon if specified, otherwise use default
        if (folderConfig?.icon && fs.existsSync(folderConfig.icon)) {
          folderItem.iconPath = Uri.file(folderConfig.icon);
        } else {
          folderItem.iconPath = ThemeIcon.Folder;
        }

        // Store full path in description to track hierarchy
        folderItem.description = childPath;
        items.push(folderItem);
      }

      // Then add files in this folder
      items.push(...node.files);

      return items;
    }

    return [];
  }

  // Helper function to find a node by its path
  private findNodeByPath(fullPath?: string): TreeNode | undefined {
    // If no path is provided, return the root
    if (!fullPath || fullPath === 'root') {
      return this.rootNode;
    }

    // Navigate through the tree structure using the path
    const pathParts = fullPath.split('.');
    let currentNode = this.rootNode;

    for (const part of pathParts) {
      if (!currentNode.children.has(part)) {
        return undefined;
      }
      currentNode = currentNode.children.get(part)!;
    }

    return currentNode;
  }
}

// This method is called when your extension is deactivated
export function deactivate() { }

class MarkdownProvider implements NotebookSerializer {
  deserializeNotebook(data: Uint8Array, token: CancellationToken): NotebookData | Thenable<NotebookData> {
    // use the token to cancel long running operations
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
    // use the token to cancel long running operations
    if (token.isCancellationRequested) {
      return Promise.resolve(new Uint8Array());
    }
    return Buffer.from(codebook.writeCellsToMarkdown(data.cells));
  }
}

export function rawToNotebookCellData(data: codebook.RawNotebookCell): NotebookCellData {
  return <NotebookCellData>{
    kind: data.kind,
    languageId: data.language,
    metadata: { leadingWhitespace: data.leadingWhitespace, trailingWhitespace: data.trailingWhitespace, indentation: data.indentation },
    outputs: data.outputs || [],
    value: data.content,
  };
}

export { addFileToTreeViewFolder, addFolderToTreeView, addSubFolder, renameFolderDisplay, removeFolderFromTreeView, removeFileFromTreeView, renameTreeViewFile };
