import { window, commands, Uri, QuickPickItem } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as config from './config';

/**
 * Creates a new CodebookMD notebook file and opens it in the editor
 * Allows for default filename and folder selection options
 */
export async function createNewNotebook(): Promise<void> {
  try {
    // Get workspace folder
    const workspaceFolder = config.getWorkspaceFolder();
    if (!workspaceFolder) {
      window.showErrorMessage('No workspace folder found. Please open a workspace first.');
      return;
    }

    // Determine current folder context (active file directory or workspace root)
    const activeEditor = window.activeTextEditor;
    let currentFolderPath = workspaceFolder;
    let currentFolderDisplayName = 'Workspace Root';

    if (activeEditor) {
      const activeDocUri = activeEditor.document.uri;
      if (activeDocUri.scheme === 'file') {
        // Get the directory of the active file
        const activeFileDir = path.dirname(activeDocUri.fsPath);
        currentFolderPath = activeFileDir;

        // Create a display name that's relative to the workspace
        if (activeFileDir.startsWith(workspaceFolder)) {
          const relativePath = path.relative(workspaceFolder, activeFileDir);
          currentFolderDisplayName = relativePath ? `/${relativePath}` : 'Workspace Root';
        } else {
          currentFolderDisplayName = activeFileDir;
        }
      }
    }

    // Ask for the file name, with default if user presses enter
    const fileName = await window.showInputBox({
      prompt: 'Enter the name for your new CodebookMD notebook (press Enter for default)',
      placeHolder: 'Enter filename or keep default',
      value: 'Untitled-1.md',
      validateInput: (value) => {
        // Empty input is allowed (will use default)
        if (!value.trim()) {
          return null;
        }
        // Ensure the filename has .md extension
        if (!value.endsWith('.md') && !value.endsWith('.markdown')) {
          return 'File name should end with .md or .markdown';
        }
        return null;
      }
    });

    if (fileName === undefined) {
      return; // User canceled the input
    }

    // Use either the entered name or default to Untitled-1.md
    const trimmedFileName = fileName.trim();
    const finalFileName = trimmedFileName === '' ? 'Untitled-1.md' :
      (trimmedFileName.endsWith('.md') || trimmedFileName.endsWith('.markdown')) ?
        trimmedFileName : `${trimmedFileName}.md`;

    // Define folder options
    interface FolderQuickPickItem extends QuickPickItem {
      action: 'current' | 'choose';
    }

    const folderOptions: FolderQuickPickItem[] = [
      {
        label: `$(folder) Current Folder (${currentFolderDisplayName})`,
        description: "Save in the folder of the active file",
        action: 'current'
      },
      {
        label: "$(folder-opened) Choose Folder...",
        description: "Select a specific folder to save the notebook",
        action: 'choose'
      }
    ];

    // Ask for the folder location
    const selectedFolderOption = await window.showQuickPick(folderOptions, {
      placeHolder: 'Where would you like to save the notebook?',
      title: 'Select Folder Location'
    });

    if (!selectedFolderOption) {
      return; // User canceled the folder selection
    }    // Determine the relative path based on user's selection
    let selectedFolderPath = workspaceFolder;

    if (selectedFolderOption.action === 'current') {
      // Use the directory of the current active file
      selectedFolderPath = currentFolderPath;
    } else if (selectedFolderOption.action === 'choose') {
      // Show a custom folder selection dialog
      const folderUri = await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(currentFolderPath), // Start in current folder context
        openLabel: 'Select Folder',
        title: 'Select a folder for your new notebook'
      });

      if (!folderUri || folderUri.length === 0) {
        return; // User canceled folder selection
      }

      // Get the selected folder path
      selectedFolderPath = folderUri[0].fsPath;

      // Check if the selected folder is within the workspace
      if (!selectedFolderPath.startsWith(workspaceFolder)) {
        const confirm = await window.showWarningMessage(
          'The selected folder is outside your workspace. Would you like to continue?',
          'Yes', 'No'
        );
        if (confirm !== 'Yes') {
          return;
        }
      }
    }

    // Create the full path
    const fullPath = path.join(selectedFolderPath, finalFileName);

    // Check if file already exists
    if (fs.existsSync(fullPath)) {
      const overwrite = await window.showWarningMessage(
        `File '${finalFileName}' already exists in the selected location. Do you want to overwrite it?`,
        'Yes', 'No'
      );
      if (overwrite !== 'Yes') {
        return; // User chose not to overwrite
      }
    }

    // Create directory if it doesn't exist
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Template content for a new CodebookMD notebook
    const templateContent = `# ${path.parse(finalFileName).name}

## Introduction

This is a new CodebookMD notebook. You can add content and executable code blocks below.

## Code Blocks

### Example Markdown

You can write regular markdown content with formatting like **bold**, *italic*, or \`code\`.

### Example Code Block

\`\`\`shellscript
# This is an example code block
echo "Hello from CodebookMD!"
# Click the play button to run this code
\`\`\`

## Quick Tips

- Use the gear icon (⚙️) to configure code blocks
- Hover over file links to preview their content
- Add this notebook to your My Notebooks view for quick access
`;

    // Write the file
    fs.writeFileSync(fullPath, templateContent, 'utf8');

    // Open the new file in the CodebookMD notebook editor
    const uri = Uri.file(fullPath);
    await commands.executeCommand('vscode.openWith', uri, 'codebook-md');

    window.showInformationMessage(`Created new CodebookMD notebook: ${finalFileName}`);
  } catch (error) {
    console.error('Error creating new notebook:', error);
    window.showErrorMessage(`Failed to create new notebook: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a new CodebookMD notebook from the current text selection
 * Uses the selected text and its language as content instead of the default template
 */
export async function createNotebookFromSelection(): Promise<void> {
  try {
    // Get workspace folder
    const workspaceFolder = config.getWorkspaceFolder();
    if (!workspaceFolder) {
      window.showErrorMessage('No workspace folder found. Please open a workspace first.');
      return;
    }

    // Get active editor and its selection
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage('No active text editor found.');
      return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      window.showErrorMessage('No text selected. Please select some text to create a notebook from.');
      return;
    }

    // Get the selected text and language ID
    const selectedText = editor.document.getText(selection);
    const languageId = editor.document.languageId;

    // Determine current folder context (active file directory or workspace root)
    let currentFolderPath = workspaceFolder;
    let currentFolderDisplayName = 'Workspace Root';

    if (editor) {
      const activeDocUri = editor.document.uri;
      if (activeDocUri.scheme === 'file') {
        // Get the directory of the active file
        const activeFileDir = path.dirname(activeDocUri.fsPath);
        currentFolderPath = activeFileDir;

        // Create a display name that's relative to the workspace
        if (activeFileDir.startsWith(workspaceFolder)) {
          const relativePath = path.relative(workspaceFolder, activeFileDir);
          currentFolderDisplayName = relativePath ? `/${relativePath}` : 'Workspace Root';
        } else {
          currentFolderDisplayName = activeFileDir;
        }
      }
    }

    // Ask for the file name, with default if user presses enter
    const fileName = await window.showInputBox({
      prompt: 'Enter the name for your new CodebookMD notebook (press Enter for default)',
      placeHolder: 'Enter filename or keep default',
      value: 'Untitled-1.md',
      validateInput: (value) => {
        // Empty input is allowed (will use default)
        if (!value.trim()) {
          return null;
        }
        // Ensure the filename has .md extension
        if (!value.endsWith('.md') && !value.endsWith('.markdown')) {
          return 'File name should end with .md or .markdown';
        }
        return null;
      }
    });

    if (fileName === undefined) {
      return; // User canceled the input
    }

    // Use either the entered name or default to Untitled-1.md
    const trimmedFileName = fileName.trim();
    const finalFileName = trimmedFileName === '' ? 'Untitled-1.md' :
      (trimmedFileName.endsWith('.md') || trimmedFileName.endsWith('.markdown')) ?
        trimmedFileName : `${trimmedFileName}.md`;

    // Define folder options
    interface FolderQuickPickItem extends QuickPickItem {
      action: 'current' | 'choose';
    }

    const folderOptions: FolderQuickPickItem[] = [
      {
        label: `$(folder) Current Folder (${currentFolderDisplayName})`,
        description: "Save in the folder of the active file",
        action: 'current'
      },
      {
        label: "$(folder-opened) Choose Folder...",
        description: "Select a specific folder to save the notebook",
        action: 'choose'
      }
    ];

    // Ask for the folder location
    const selectedFolderOption = await window.showQuickPick(folderOptions, {
      placeHolder: 'Where would you like to save the notebook?',
      title: 'Select Folder Location'
    });

    if (!selectedFolderOption) {
      return; // User canceled the folder selection
    }

    // Determine the selected folder path based on user's selection
    let selectedFolderPath = workspaceFolder;

    if (selectedFolderOption.action === 'current') {
      // Use the directory of the current active file
      selectedFolderPath = currentFolderPath;
    } else if (selectedFolderOption.action === 'choose') {
      // Show a custom folder selection dialog
      const folderUri = await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(currentFolderPath), // Start in current folder context
        openLabel: 'Select Folder',
        title: 'Select a folder for your new notebook'
      });

      if (!folderUri || folderUri.length === 0) {
        return; // User canceled folder selection
      }

      // Get the selected folder path
      selectedFolderPath = folderUri[0].fsPath;

      // Check if the selected folder is within the workspace
      if (!selectedFolderPath.startsWith(workspaceFolder)) {
        const confirm = await window.showWarningMessage(
          'The selected folder is outside your workspace. Would you like to continue?',
          'Yes', 'No'
        );
        if (confirm !== 'Yes') {
          return;
        }
      }
    }

    // Create the full path
    const fullPath = path.join(selectedFolderPath, finalFileName);

    // Check if file already exists
    if (fs.existsSync(fullPath)) {
      const overwrite = await window.showWarningMessage(
        `File '${finalFileName}' already exists in the selected location. Do you want to overwrite it?`,
        'Yes', 'No'
      );
      if (overwrite !== 'Yes') {
        return; // User chose not to overwrite
      }
    }

    // Create directory if it doesn't exist
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Create content for the new notebook based on the selected text
    const noteTitle = path.parse(finalFileName).name;
    const templateContent = `# ${noteTitle}

## Generated from Selection

This notebook was created from selected text in your editor.

### Source Code (${languageId})

\`\`\`${languageId}
${selectedText}
\`\`\`

## Quick Tips

- Use the gear icon (⚙️) to configure code blocks
- Hover over file links to preview their content
- Add this notebook to your My Notebooks view for quick access
`;

    // Write the file
    fs.writeFileSync(fullPath, templateContent, 'utf8');

    // Open the new file in the CodebookMD notebook editor
    const uri = Uri.file(fullPath);
    await commands.executeCommand('vscode.openWith', uri, 'codebook-md');

    window.showInformationMessage(`Created new CodebookMD notebook from selection: ${finalFileName}`);
  } catch (error) {
    console.error('Error creating notebook from selection:', error);
    window.showErrorMessage(`Failed to create notebook from selection: ${error instanceof Error ? error.message : String(error)}`);
  }
}
