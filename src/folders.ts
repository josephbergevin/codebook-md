import * as fs from 'fs';
import * as path from 'path';
import { window, workspace } from 'vscode';

export class FolderGroup {
  name: string;
  source: string;
  icon: string;
  hide: boolean;
  folders: FolderGroupFolder[] = [];

  constructor(name: string, source: string, folders: FolderGroupFolder[]) {
    this.name = name;
    this.source = source;
    this.icon = '';
    this.hide = false;
    this.folders = folders;
  }

  addFolder(folder: FolderGroupFolder) {
    this.folders.push(folder);
  }

  removeFolder(folderName: string): boolean {
    const removeRecursively = (folders: FolderGroupFolder[], name: string): FolderGroupFolder[] => {
      return folders.filter(folder => {
        if (folder.name === name) {
          return false;
        }
        if (folder.folders && folder.folders.length > 0) {
          folder.folders = removeRecursively(folder.folders, name);
        }
        return true;
      });
    };

    const originalLength = this.folders.length;
    this.folders = removeRecursively(this.folders, folderName);

    // Return true if the folder was found and removed
    return this.folders.length < originalLength;
  }

  moveTreeViewItemUp(objId: string): boolean {
    const targetFolder = this.findTargetFolderByObjectId(objId);
    if (!targetFolder) {
      console.error(`Folder not found for objectId: ${objId}`);
      return false;
    }

    const fileIndex = objectIdFileIndex(objId);

    // if the objId is for a file:
    if (fileIndex >= 0) {
      // Move the file up if possible
      if (targetFolder && targetFolder.files && fileIndex > 0) {
        // Swap with previous file
        const temp = targetFolder.files[fileIndex];
        targetFolder.files[fileIndex] = targetFolder.files[fileIndex - 1];
        targetFolder.files[fileIndex - 1] = temp;
        return true;
      }

      // If the file is already at the top, return false
      console.log('Item is already at the top');
      return false;
    }

    // Handle folder movement
    // The objectId is the folder path, e.g., "0.1.2"
    const parentFolder = this.findTargetParentFolderByObjectId(objId);
    // if we're at the root level, use this.folders for the move
    // if we're not at the root level, use parentFolder.folders
    if (parentFolder) {
      const folderIndex = parentFolder.folders.findIndex(folder => folder.name === targetFolder.name);
      if (folderIndex > 0) {
        // Swap with previous folder
        const temp = parentFolder.folders[folderIndex];
        parentFolder.folders[folderIndex] = parentFolder.folders[folderIndex - 1];
        parentFolder.folders[folderIndex - 1] = temp;

        console.log('Item moved up successfully');
        return true;
      }

      console.log('Item is already at the top');
      return false;
    }

    // swap with previous folder at root level
    const folderIndex = this.folders.findIndex(folder => folder.name === targetFolder.name);
    if (folderIndex > 0) {
      // Swap with previous folder at root level
      const temp = this.folders[folderIndex];
      this.folders[folderIndex] = this.folders[folderIndex - 1];
      this.folders[folderIndex - 1] = temp;
      console.log('Item moved up successfully');
      return true;
    }

    console.log('Item is already at the top');
    return false;
  }

  moveTreeViewItemDown(objId: string): boolean {
    const targetFolder = this.findTargetFolderByObjectId(objId);
    if (!targetFolder) {
      console.error(`Folder not found for objectId: ${objId}`);
      return false;
    }

    const fileIndex = objectIdFileIndex(objId);

    // if the objId is for a file:
    if (fileIndex >= 0) {
      // Move the file down if possible
      if (targetFolder && targetFolder.files && fileIndex < targetFolder.files.length - 1) {
        // Swap with next file
        const temp = targetFolder.files[fileIndex];
        targetFolder.files[fileIndex] = targetFolder.files[fileIndex + 1];
        targetFolder.files[fileIndex + 1] = temp;
        return true;
      }

      // If the file is already at the bottom, return false
      console.log('Item is already at the bottom');
      return false;
    }

    // Handle folder movement
    // The objectId is the folder path, e.g., "0.1.2"
    const parentFolder = this.findTargetParentFolderByObjectId(objId);
    // if we're at the root level, use this.folders for the move
    // if we're not at the root level, use parentFolder.folders
    if (parentFolder) {
      const folderIndex = parentFolder.folders.findIndex(folder => folder.name === targetFolder.name);
      if (folderIndex >= 0 && folderIndex < parentFolder.folders.length - 1) {
        // Swap with next folder
        const temp = parentFolder.folders[folderIndex];
        parentFolder.folders[folderIndex] = parentFolder.folders[folderIndex + 1];
        parentFolder.folders[folderIndex + 1] = temp;

        if (parentFolder.folders && folderIndex > 0) {
          // Swap with previous folder
          const temp = parentFolder.folders[folderIndex];
          parentFolder.folders[folderIndex] = parentFolder.folders[folderIndex - 1];
          parentFolder.folders[folderIndex - 1] = temp;
          console.log('Item moved down successfully');
          return true;
        }

        console.log('Folder is already at the top');
        return false;
      }

      console.log('Folder is already at the bottom');
      return false;
    }

    // swap with next folder at root level
    const folderIndex = this.folders.findIndex(folder => folder.name === targetFolder.name);
    if (folderIndex >= 0 && folderIndex < this.folders.length - 1) {
      // Swap with next folder at root level
      const temp = this.folders[folderIndex];
      this.folders[folderIndex] = this.folders[folderIndex + 1];
      this.folders[folderIndex + 1] = temp;
      console.log('Item moved down successfully');
      return true;
    }

    console.log('Folder is already at the bottom');
    return false;
  }

  // findTargetFolderByObjectId finds a folder by its objectId.
  // The objectId is expected to be in the format "folderIndex[fileIndex]", e.g., "0.1[2]".
  // If the objectId is not in the expected format, it returns undefined.
  // If the objectId is a file, it returns the folder containing that file.
  // If the objectId is a folder, it returns that folder.
  // If the objectId is not a file or folder, it returns undefined.
  findTargetFolderByObjectId(objId: string): FolderGroupFolder | undefined {
    // Check if the objectId is a folder or file
    const folderPath = objectIdFolderPath(objId);
    if (!folderPath) {
      console.error(`Invalid objectId format: ${objId}`);
      return undefined;
    }

    // Split the folder path into indices
    const folderIndices = folderPath.split('.').map(index => parseInt(index, 10));

    // Navigate to the target folder
    let currentFolders = this.folders;
    let targetFolder: FolderGroupFolder | undefined;

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
      console.error(`Failed to find folder: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }

    return targetFolder;
  }

  // findTargetParentFolderByObjectId finds the parent folder of a file or folder by its objectId.
  // It works similar to findTargetFolderByObjectId but returns the parent folder of the target folder.
  // If the target folder is at the root level, it returns undefined.
  findTargetParentFolderByObjectId(objId: string): FolderGroupFolder | undefined {
    const targetPath = objectIdFolderPath(objId);
    if (!targetPath) {
      console.error(`Invalid objectId format: ${objId}`);
      return undefined;
    }

    const targetPathParts = targetPath.split('.');

    // if we're at the root level, we can't find a parent
    if (targetPathParts.length === 1) {
      console.log('target folder is at the root level');
      return undefined;
    }

    const parentPath = targetPathParts.slice(0, -1).join('.');
    return this.findTargetFolderByObjectId(parentPath);
  }

  // findFolder finds a folder by its name in the folder group
  findFolder(folderName: string): FolderGroupFolder | undefined {
    const find = (folders: FolderGroupFolder[], name: string): FolderGroupFolder | undefined => {
      for (const folder of folders) {
        if (folder.name === name) {
          return folder;
        }
        if (folder.folders) {
          const found = find(folder.folders, name);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };

    return find(this.folders, folderName);
  }

  // applyChanges applies the current state of the folder group to the .source file
  applyChanges(): void {
    try {
      if (!this.source) {
        throw new Error('No workspace folder found');
      }

      // Read existing settings
      const existingSettings = readFolderGroupSettings(this.source);

      // Update only the codebook-md.treeView section
      const updatedSettings = {
        ...existingSettings,
        'codebook-md.treeView': {
          folders: this.folders
        }
      };

      // Create settings directory if it doesn't exist
      const vscodeDirPath = path.dirname(this.source);
      if (!fs.existsSync(vscodeDirPath)) {
        fs.mkdirSync(vscodeDirPath, { recursive: true });
      }

      // Read existing content to preserve formatting and comments
      let existingContent = '';
      if (fs.existsSync(this.source)) {
        existingContent = fs.readFileSync(this.source, 'utf8');
      }

      // Preserve formatting from existing content
      const indent = existingContent.match(/^\s+/m)?.[0] || '  ';

      // Preserve any leading comments
      const commentMatch = existingContent.match(/^([\s\S]*?)\{/);
      const leadingContent = commentMatch ? commentMatch[1] : '';

      // Write the updated settings while preserving comments and formatting
      const content = leadingContent + JSON.stringify(updatedSettings, null, indent);
      fs.writeFileSync(this.source, content, 'utf8');
    } catch (err) {
      const error = err as Error;
      console.error('Failed to update tree view settings:', error);
      window.showErrorMessage(`Failed to update tree view settings: ${error.message}`);
    }
  }
}

export class FolderGroupFolder {
  name: string;
  folders: FolderGroupFolder[] = [];
  files: FolderGroupFile[];
  icon: string;
  hide: boolean;

  constructor(name: string) {
    this.name = name;
    this.icon = '';
    this.hide = false;
    this.files = [];
  }

  addFile(file: FolderGroupFile) {
    this.files.push(file);
  }

  removeFile(filePath: string) {
    this.files = this.files.filter(file => file.path !== filePath);
  }

  updateFile(filePath: string, newFile: FolderGroupFile) {
    const index = this.files.findIndex(file => file.path === filePath);
    if (index !== -1) {
      this.files[index] = newFile;
    }
  }

  findFile(filePath: string): FolderGroupFile | undefined {
    return this.files.find(file => file.path === filePath);
  }

  findFileByObjectId(objId: string): FolderGroupFile | undefined {
    const fileIndex = objectIdFileIndex(objId);
    if (fileIndex === -1) {
      console.error(`Invalid file ID format: ${objId}`);
      return undefined;
    }

    // Return the file at the specified index
    return this.files[fileIndex];
  }

  getAllFiles(): FolderGroupFile[] {
    return this.files;
  }
}

// objectIdIsFile checks if the objectId is a file with a simple check
// for the presence of square brackets
// The objectId is expected to be in the format "folderIndex[fileIndex]", e.g., "0.1[2]"
export function objectIdIsFile(objId: string): boolean {
  return objId.includes('[');
}


// objectIdFileIndex extracts the file index from the objectId
// The objectId is expected to be in the format "folderIndex[fileIndex]", e.g., "0.1[2]"
// If the objectId is not in the expected format, it returns -1
// If the objectId is a file, it returns the file index
// If the objectId is not a file, it returns -1
export function objectIdFileIndex(objId: string): number {
  // Check if the objectId is a file
  if (!objectIdIsFile(objId)) {
    return -1;
  }

  const matches = objId.match(/\[(\d+)\]/);
  if (!matches || matches.length !== 2) {
    console.error(`Invalid file ID format: ${objId}`);
    return -1;
  }

  // Extract the file index from the objectId
  return parseInt(matches[1], 10);
}

// folderPathFromObjectId extracts the folder path from the objectId
export function objectIdFolderPath(objId: string): string | undefined {
  return objectIdIsFile(objId) ? objId.split('[')[0] : objId;
}

export class FolderGroupFile {
  name: string;
  path: string;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }
}

// getTreeViewFolderGroup is a convenience function to get the tree view folder group from the configuration
export function getTreeViewFolderGroup(settingsPath: string): FolderGroup {
  // Get workspace settings from the given settings path
  const vscodeSettings = readFolderGroupSettings(settingsPath);

  // Check both possible configuration paths
  const workspaceFolders =
    vscodeSettings['codebook-md.treeView']?.folders ||
    vscodeSettings['codebook-md']?.treeView?.folders ||
    [];

  // Get user settings from VS Code configuration API
  const userConfig = workspace.getConfiguration('codebook-md');
  const userFolders = userConfig.get<FolderGroupFolder[]>('treeView.folders', []);

  // Merge with preference for workspace settings (they override user settings)
  const mergedFolders = [...userFolders];

  // Add workspace folders with deduplication by name
  for (const folder of workspaceFolders) {
    const existingIndex = mergedFolders.findIndex(f => f.name === folder.name);
    if (existingIndex >= 0) {
      // Update existing folder
      mergedFolders[existingIndex] = folder;
    } else {
      // Add new folder
      mergedFolders.push(folder);
    }
  }

  return new FolderGroup('Codebook', settingsPath, mergedFolders);
}

// Type for VS Code settings
interface FolderGroupSettings {
  'codebook-md'?: {
    treeView?: {
      folders: FolderGroupFolder[];
    };
    [key: string]: unknown;
  };
  'codebook-md.treeView'?: {
    folders: FolderGroupFolder[];
  };
  [key: string]: unknown;
}

// Helper function to read the given settings path
export function readFolderGroupSettings(settingsPath: string): FolderGroupSettings {
  if (settingsPath === '') {
    return {};
  }

  try {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    console.error('Error reading settings file', error);
    return {};
  }
}

// Helper function to update tree view settings in the given settings path
export function updateTreeViewSettings(folderGroup: FolderGroup): void {
  try {
    if (!folderGroup.source) {
      throw new Error('No workspace folder found');
    }

    // Read existing settings
    const existingSettings = readFolderGroupSettings(folderGroup.source);

    // Update only the codebook-md.treeView section
    const updatedSettings = {
      ...existingSettings,
      'codebook-md.treeView': {
        folders: folderGroup.folders
      }
    };

    // Create settings directory if it doesn't exist
    const vscodeDirPath = path.dirname(folderGroup.source);
    if (!fs.existsSync(vscodeDirPath)) {
      fs.mkdirSync(vscodeDirPath, { recursive: true });
    }

    // Read existing content to preserve formatting and comments
    let existingContent = '';
    if (fs.existsSync(folderGroup.source)) {
      existingContent = fs.readFileSync(folderGroup.source, 'utf8');
    }

    // Preserve formatting from existing content
    const indent = existingContent.match(/^\s+/m)?.[0] || '  ';

    // Preserve any leading comments
    const commentMatch = existingContent.match(/^([\s\S]*?)\{/);
    const leadingContent = commentMatch ? commentMatch[1] : '';

    // Write the updated settings while preserving comments and formatting
    const content = leadingContent + JSON.stringify(updatedSettings, null, indent);
    fs.writeFileSync(folderGroup.source, content, 'utf8');
  } catch (err) {
    const error = err as Error;
    console.error('Failed to update tree view settings:', error);
    window.showErrorMessage(`Failed to update tree view settings: ${error.message}`);
  }
}

// suggestedDisplayName generates a display name from a filename by:
// 1. Removing the file extension
// 2. Splitting on common word separators (underscore, dash, space, period) and camelCase boundaries
// 3. Capitalizing first letter of each word
// 4. Joining with spaces
export function suggestedDisplayName(fileName: string): string {
  return fileName
    .replace(/\.\w+$/, '') // Remove extension
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase words
    .split(/[_\-\s.]/) // Split by underscore, dash, space, or period
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter of each word
    .join(' '); // Join with spaces
}
