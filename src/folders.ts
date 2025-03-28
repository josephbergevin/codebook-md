import * as fs from 'fs';
import * as config from './config';

export class FolderGroup {
  name: string;
  source: string;
  index: number;
  icon: string;
  hide: boolean;
  folders: FolderGroupFolder[] = [];

  constructor(name: string, source: string, folders: FolderGroupFolder[]) {
    this.name = name;
    this.source = source;
    this.index = 0;
    this.icon = '';
    this.hide = false;
    this.folders = folders;
  }

  addFolder(folder: FolderGroupFolder): void {
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

      // If the file is already at the bottom or index is invalid, return false
      console.log('Item is already at the bottom');
      return false;
    } else if (objectIdIsFile(objId)) {
      // If it's a file ID format but index is invalid, return false
      return false;
    }

    // Handle folder movement
    const parentFolder = this.findTargetParentFolderByObjectId(objId);
    // if we're at the root level, use this.folders for the move
    // if we're not at the root level, use parentFolder.folders
    const folderList = parentFolder ? parentFolder.folders : this.folders;
    const targetIndex = folderList.findIndex(folder => folder.name === targetFolder.name);

    if (targetIndex >= 0 && targetIndex < folderList.length - 1) {
      // Swap with next folder
      const temp = folderList[targetIndex];
      folderList[targetIndex] = folderList[targetIndex + 1];
      folderList[targetIndex + 1] = temp;
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
    // Get the folder path part of the object ID
    const targetPath = objectIdFolderPath(objId);
    if (!targetPath) {
      console.error(`Invalid objectId format: ${objId}`);
      return undefined;
    }

    // For root level items (either folders or files at root), return undefined
    if (!targetPath.includes('.')) {
      return undefined;
    }

    // For files, return their containing folder
    if (objectIdIsFile(objId)) {
      return this.findTargetFolderByObjectId(targetPath);
    }

    // For folders, get the parent path and return that folder
    const parentPath = targetPath.split('.').slice(0, -1).join('.');
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
  // find the folderGroup with (index === this.index, name === this.name) - overwrite it
  // and save the file
  applyChanges(): void {
    // Get current folders from settings
    const configPath = config.getCodebookConfigFilePath();

    // Validate configPath before proceeding
    if (!configPath) {
      console.error('Cannot apply changes: configuration path is undefined or empty');
      return;
    }

    const codebookConfig = readCodebookConfig(configPath);

    // if there are no folder groups, push this one and save
    if (!codebookConfig.folderGroups || codebookConfig.folderGroups.length === 0) {
      codebookConfig.folderGroups = [this];
      writeCodebookConfig(configPath, codebookConfig);
      console.log('Folder group did not exist - created successfully');
      return;
    }

    // find the folder group with the same name and index
    const existingGroupIndex = codebookConfig.folderGroups.findIndex(group => group.name === this.name && group.index === this.index);
    if (existingGroupIndex !== -1) {
      // Update the existing folder group
      codebookConfig.folderGroups[existingGroupIndex].folders = this.folders;
      writeCodebookConfig(configPath, codebookConfig);
      console.log('Folder group updated successfully');
      return;
    }

    // Otherwise: 
    // - set the index to the last
    // - push this folder group to the list
    // - save
    this.index = codebookConfig.folderGroups.length;
    codebookConfig.folderGroups.push(this);
    writeCodebookConfig(configPath, codebookConfig);
    console.log('Folder group added successfully');
  }
}

// writeCodebookConfig saves the updated configuration to the file
export function writeCodebookConfig(configPath: string, codebookConfig: CodebookConfig): void {
  try {
    // Validate the configPath to prevent undefined path error
    if (!configPath) {
      throw new Error('Configuration path is undefined or empty');
    }

    const jsonContent = JSON.stringify(codebookConfig, null, 2);
    fs.writeFileSync(configPath, jsonContent, 'utf8');
    console.log('Configuration saved successfully');
  } catch (error) {
    console.error('Error saving configuration', error);
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

  // Check for proper bracket format with no nested brackets
  const matches = objId.match(/\[(\d+)\]/);
  if (!matches || matches.length !== 2 || objId.indexOf('[') !== objId.lastIndexOf('[') ||
    objId.indexOf(']') !== objId.lastIndexOf(']')) {
    console.error(`Invalid file ID format: ${objId}`);
    return -1;
  }

  // Extract and validate the file index
  const index = parseInt(matches[1], 10);
  if (index < 0) {
    console.error(`Invalid file ID format: ${objId}`);
    return -1;
  }

  return index;
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
export function getWorkspaceFolderGroup(configPath: string): FolderGroup {
  // Validate the settings path to prevent downstream undefined errors
  if (!configPath) {
    console.error('Settings path is undefined or empty');
    // Return a new folder group with a default name, but ensure we're not using an undefined source
    return new FolderGroup('Workspace', '', []);
  }

  // get workspace settings from the given settings path
  const codebookConfig = readCodebookConfig(configPath);

  // loop through the folder groups and find the one with name = 'Workspace'
  const workspaceGroup = codebookConfig.folderGroups?.find(group => group.name === 'Workspace');
  if (workspaceGroup) {
    // Create a proper FolderGroup instance to ensure all prototype methods are available
    const folderGroup = new FolderGroup(
      workspaceGroup.name,
      // Ensure source property is set correctly - use configPath if workspaceGroup.source is undefined
      workspaceGroup.source || configPath,
      workspaceGroup.folders || []
    );
    // Copy other properties
    folderGroup.index = workspaceGroup.index;
    folderGroup.icon = workspaceGroup.icon;
    folderGroup.hide = workspaceGroup.hide;

    return folderGroup;
  }

  return new FolderGroup('Workspace', configPath, []);
}

// Type for VS Code settings
export class CodebookConfig {
  folderGroups?: FolderGroup[];

  constructor() {
    this.folderGroups = [];
  }
}

// readCodebookConfig reads the codebook-md configuration file
export function readCodebookConfig(configPath: string): CodebookConfig {
  if (configPath === '') {
    console.log('No codebook-md configuration found');
    return new CodebookConfig();
  }

  try {
    if (!fs.existsSync(configPath)) {
      return new CodebookConfig();
    }
    const jsonContent = fs.readFileSync(configPath, 'utf8');
    const codebookConfig = JSON.parse(jsonContent);

    // if there are folder groups, set the index values in a loop
    if (codebookConfig.folderGroups) {
      codebookConfig.folderGroups.forEach((group: FolderGroup, index: number) => {
        group.index = index;
      });
    }

    return codebookConfig;
  } catch (error) {
    console.error('Error reading settings file', error);
    return {};
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
