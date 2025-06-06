import * as fs from 'fs';
import * as config from './config';
import * as path from 'path';

// FolderGroup represents a group of folders in the codebook-md configuration
// the OjectId format is used to identify folders and files within the FolderGroups
// - ObjectId format:
// - The beginning index is 1 (not 0) - however, we will use 0 as the file index if the item is a folder. 
// - Here is objectId template:
//   - {{folderGroupIndex}}-{{folder.tree.path}}-{{fileIndex}}
//     - example: 1-1.2-2
//       - 1: folderGroupIndex #1
//       - 1.2: folder.tree.path
//         - 1: root-folder index #1
//         - 1.2: sub-folder index #2 in root-folder index #1
//       - 2: fileIndex #2
//       - So 1-1.2-2 means this is the 2nd file in the 2nd sub-folder in the 1st root-folder of the 1st folderGroup
//       - The objectId's need to be updated accordingly in the code to reflect this structure
//       - Ensure that the logic for generating objectId's in #file:notebooksView.ts is consistent with this format  
// - Here's an example folder/file structure with objectId's
//   - FolderGroup #1
//     - MyRootFolder (1-1-0)
//       - MyFile (1-1-1)
//       - MyFile (1-1-2)
//       - MySubFolder (1-1.1-0)
//         - MyFile (1-1.1.1)
//         - MyFile (1-1.1.2)
//         - MySubSubFolder (1-1.1.1-0)
//           - MyFile (1-1.1.1-1)
//           - MyFile (1-1.1.1-2)
//     - MyRootFolder (1-2-0)
//       - MyFile (1-2-1)
//       - MyFile (1-2-2)
//       - MySubFolder (1-2.1-0)
//         - MyFile (1-2.1.1)
//         - MyFile (1-2.1.2)
//         - MySubSubFolder (1-2.1.1-0)
//           - MyFile (1-2.1.1-1)
//           - MyFile (1-2.1.1-2)
//   - FolderGroup #2
//     - MyRootFolder (2-1-0)
//       - MyFile (2-1-1)
//       - MyFile (2-1-2)
//       - MySubFolderC (2-1.1-0)
//         - MyFile (2-1.1.1)
//         - MyFile (2-1.1.2)
//         - MySubSubFolder (2-1.1.1-0)
//           - MyFile (2-1.1.1-1)
//           - MyFile (2-1.1.1-2)
//   - FolderGroup #3
//     - MyRootFolder (3-1-0)
//       - MyFile (3-1-1)
//       - MyFile (3-1-2)
//       - MySubFolderC (3-1.1-0)
//         - MyFile (3-1.1.1)
//         - MyFile (3-1.1.2)
//         - MySubSubFolder (3-1.1.1-0)
//           - MyFile (3-1.1.1-1)
//           - MyFile (3-1.1.1-2)
export class FolderGroup {
  name: string;
  source: string; // 
  index: number; // not included in json
  description: string;
  icon: string;
  hide: boolean;
  isDynamic?: boolean; // Flag to indicate if this folder group is dynamically generated
  folders: FolderGroupFolder[] = [];

  constructor(name: string, source: string, description: string, folders: FolderGroupFolder[]) {
    this.name = name;
    this.source = source;
    this.index = 0;
    this.description = description;
    this.icon = '';
    this.hide = false;
    this.folders = folders;
  }

  // moves the entity up using the following steps:
  // - open the folder group
  // - walk through the folders
  // - find the target folder
  // - if the target folder is at the root level, use folderGroup.folders
  // - if the entity is a file: 
  //   - swap it with the previous file
  // - if the entity is a folder:
  //   - swap it with the previous folder
  // - if the entity is already at the top of its parent, return false
  // - return true if the entity was moved, false otherwise
  moveEntityUp(entity: FolderGroupEntity): boolean {
    // - use the folder group
    // if the entity is a file, find the target folder and move the file up
    if (entity.isFile()) {
      // Check if the entity is at the root level
      const arrayIndex = entity.fileArrayIndex();
      if (arrayIndex <= 0) {
        console.log(`File is already at the top: ${entity.stringify()}`);
        return false;
      }

      const targetFolder = this.findTargetFolderByEntityId(entity.folderPath);
      if (!targetFolder) {
        console.error(`Target folder not found for file: ${entity.stringify()}`);
        return false;
      }

      // Move the file up
      const previousFile = targetFolder.files[arrayIndex - 1];
      targetFolder.files[arrayIndex - 1] = targetFolder.files[arrayIndex];
      targetFolder.files[arrayIndex] = previousFile;
      this.applyStateTargetFolderFiles(targetFolder);
      console.log(`File moved up: ${entity.stringify()}`);
      return true;
    }

    // if the entity is a folder, find the parent folder and move the folder up
    const arrayIndex = entity.folderArrayIndex();

    // if the entity is a folder, find the parent folder and move the folder up
    const parentFolder = entity.getTargetParentFolder();
    if (!parentFolder) {
      // this means we're at the root level
      // Move the folder up in the root folders
      if (arrayIndex <= 0) {
        console.log(`Folder is already at the top: ${entity.stringify()}`);
        return false;
      }

      // Move the folder up
      // Swap the folder with the previous one
      if (arrayIndex < 0 || arrayIndex >= this.folders.length) {
        console.error(`Invalid array index: ${arrayIndex} for entityId: ${entity.stringify()}`);
        return false;
      }
      const previousFolder = this.folders[arrayIndex - 1];
      this.folders[arrayIndex - 1] = this.folders[arrayIndex];
      this.folders[arrayIndex] = previousFolder;
      console.log(`Folder moved up: ${entity.stringify()}`);
      return true;
    }

    if (arrayIndex <= 0) {
      console.log(`Folder is already at the top: ${entity.stringify()}`);
      return false;
    }

    // Move the folder up
    // Swap the folder with the previous one
    if (arrayIndex < 0 || arrayIndex >= parentFolder.folders.length) {
      console.error(`Invalid array index: ${arrayIndex} for entityId: ${entity.stringify()}`);
      return false;
    }
    const previousFolder = parentFolder.folders[arrayIndex - 1];
    parentFolder.folders[arrayIndex - 1] = parentFolder.folders[arrayIndex];
    parentFolder.folders[arrayIndex] = previousFolder;
    this.applyStateParentFolderFolders(parentFolder);
    console.log(`Folder moved up: ${entity.stringify()}`);
    return true;
  }

  moveEntityDown(entity: FolderGroupEntity): boolean {
    // - use the folder group
    // if the entity is a file, find the target folder and move the file down
    if (entity.isFile()) {
      // Check if the entity is at the root level
      const targetFolder = entity.getTargetFolder();
      if (!targetFolder) {
        console.error(`Target folder not found for file: ${entity.stringify()}`);
        return false;
      }

      const arrayIndex = entity.fileArrayIndex();
      if (arrayIndex >= targetFolder.files.length - 1) {
        console.log(`File is already at the bottom: ${entity.stringify()}`);
        return false;
      }

      // Move the file down
      const nextFile = targetFolder.files[arrayIndex + 1];
      targetFolder.files[arrayIndex + 1] = targetFolder.files[arrayIndex];
      targetFolder.files[arrayIndex] = nextFile;
      this.applyStateTargetFolderFiles(targetFolder);
      console.log(`File moved down: ${entity.stringify()}`);
      return true;
    }

    // if the entity is a folder, find the parent folder and move the folder down
    const arrayIndex = entity.folderArrayIndex();

    // if the entity is a folder, find the parent folder and move the folder down
    const parentFolder = entity.getTargetParentFolder();
    if (!parentFolder) {
      // this means we're at the root level
      // Move the folder down in the root folders
      if (arrayIndex >= this.folders.length - 1) {
        console.log(`Folder is already at the bottom: ${entity.stringify()}`);
        return false;
      }

      const nextFolder = this.folders[arrayIndex + 1];
      this.folders[arrayIndex + 1] = this.folders[arrayIndex];
      this.folders[arrayIndex] = nextFolder;
      console.log(`Folder moved down: ${entity.stringify()}`);
      return true;
    }

    if (arrayIndex >= parentFolder.folders.length - 1) {
      console.log(`Folder is already at the bottom: ${entity.stringify()}`);
      return false;
    }

    // Move the folder down
    // Swap the folder with the next one
    if (arrayIndex < 0 || arrayIndex >= parentFolder.folders.length) {
      console.error(`Invalid array index: ${arrayIndex} for entityId: ${entity.stringify()}`);
      return false;
    }
    const nextFolder = parentFolder.folders[arrayIndex + 1];
    parentFolder.folders[arrayIndex + 1] = parentFolder.folders[arrayIndex];
    parentFolder.folders[arrayIndex] = nextFolder;
    this.applyStateParentFolderFolders(parentFolder);
    console.log(`Folder moved down: ${entity.stringify()}`);
    return true;
  }

  applyStateTargetFolderFiles(targetFolder: FolderGroupFolder): void {
    // walk to the target folder and overwrite the files with targetFolder.files
    const walkFolders = (folders: FolderGroupFolder[]) => {
      folders.forEach(folder => {
        // Check if the folder is the target folder
        if (folder.entityId === targetFolder.entityId) {
          // Overwrite the files
          folder.files = targetFolder.files;
          console.log(`Files state applied to target folder: ${folder.name}`);
          return;
        }
        // Walk the subfolders
        if (folder.folders) {
          walkFolders(folder.folders);
        }
      });
    };

    // Start walking from the root folders
    walkFolders(this.folders);
  }

  applyStateParentFolderFolders(parentFolder: FolderGroupFolder): void {
    // walk to the parent folder and overwrite the folders with parentFolder.folders
    const walkFolders = (folders: FolderGroupFolder[]) => {
      folders.forEach(folder => {
        // Check if the folder is the parent folder
        if (folder.entityId === parentFolder.entityId) {
          // Overwrite the folders
          folder.folders = parentFolder.folders;
          console.log(`Folders state applied to parent folder: ${folder.name}`);
          return;
        }
        // Walk the subfolders
        if (folder.folders) {
          walkFolders(folder.folders);
        }
      });
    };
    // Start walking from the root folders
    walkFolders(this.folders);
  }

  removeEntity(entity: FolderGroupEntity) {
    // find the FolderGroupFolder using the entity
    const targetFolder = entity.getTargetFolder();
    if (!targetFolder) {
      console.error(`Folder not found for entityId: ${entity.folderPath}`);
      return;
    }

    // if the entity is a file, remove it from the folder
    if (entity.isFile()) {
      const arrayIndex = entity.fileArrayIndex();
      const name = targetFolder.files[arrayIndex].name;
      targetFolder.files.splice(arrayIndex, 1);
      this.applyStateTargetFolderFiles(targetFolder);
      console.log(`File removed: ${name}`);
      return;
    }

    const arrayIndex = entity.folderArrayIndex();

    // if the entity is a folder, find the parent folder and remove it
    const parentFolder = entity.getTargetParentFolder();
    if (!parentFolder) {
      // this means we're at the root level
      // remove the folder from the root folders
      const name = this.folders[arrayIndex].name;
      this.folders.splice(arrayIndex, 1);
      console.log(`Folder removed from root: ${name}`);
      return;
    }

    // not at the root level, so remove the folder from the parent folder
    if (arrayIndex < 0 || arrayIndex >= parentFolder.folders.length) {
      console.error(`Invalid array index: ${arrayIndex} for entityId: ${entity.stringify()}`);
      return;
    }
    const name = parentFolder.folders[arrayIndex].name;
    parentFolder.folders.splice(arrayIndex, 1);
    this.applyStateParentFolderFolders(parentFolder);
    console.log(`Folder removed: ${name}`);
    return;
  }

  // findTargetFolderByEntityId finds a folder by its entityId.
  // The entityId is expected to be in the format: ""
  // If the entityId is not in the expected format, it returns undefined.
  // If the entityId is a file, it returns the folder containing that file.
  // If the entityId is a folder, it returns that folder.
  // If the entityId is not a file or folder, it returns undefined.
  findTargetFolderByEntityId(entId: string): FolderGroupFolder | undefined {
    // Check if the entityId is a folder or file
    const folderPath = entId;
    if (!folderPath) {
      console.error(`Invalid entityId format: ${folderPath}`);
      return undefined;
    }

    // Split the folder path into indices
    // indicies will need to be converted to 0-based
    const folderIndices = folderPath.split('.').map(index => parseInt(index, 10) - 1);

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

  // findTargetParentFolderByEntityId finds the parent folder of a file or folder by its entityId.
  // It works similar to findTargetFolderByEntityId but returns the parent folder of the target folder.
  // If the target folder is at the root level, it returns undefined.
  findTargetParentFolderByEntityId(entId: string): FolderGroupFolder | undefined {
    // Get the folder path part of the object ID
    const targetPath = entId;
    if (!targetPath) {
      console.error(`Invalid entityId format: ${targetPath}`);
      return undefined;
    }

    // For root level items (folders at root), return undefined
    if (!targetPath.includes('.')) {
      console.log(`Target path is at the root level: ${targetPath}`);
      return undefined;
    }

    // For folders, get the parent path and return that folder
    const parentPath = targetPath.split('.').slice(0, -1).join('.');
    return this.findTargetFolderByEntityId(parentPath);
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

  // writeChanges applies the current state of the folder group to the .source file
  // find the folderGroup with (index === this.index, name === this.name) - overwrite it
  // and save the file
  writeChanges(): void {
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

    // find the folder group with the same index
    const existingGroupIndex = codebookConfig.folderGroups.findIndex(group => group.index === this.index);
    if (existingGroupIndex !== -1) {
      // Update the existing folder group
      // console.log(`Running update on FolderGroup (#${this.index} | name: ${this.name})`);
      // console.log(`Applying changes to config FolderGroup (#${codebookConfig.folderGroups[existingGroupIndex].index} | name: ${codebookConfig.folderGroups[existingGroupIndex].name})`);

      codebookConfig.folderGroups[existingGroupIndex].folders = this.folders;
      // console.log(`FolderGroup json: ${JSON.stringify(this, null, 2)}`);
      // console.log(`config FolderGroup json: ${JSON.stringify(codebookConfig.folderGroups[existingGroupIndex], null, 2)}`);
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

    // walk the folders and files to unset the entityId on each
    const walkFolders = (folders: FolderGroupFolder[]) => {
      folders.forEach(folder => {
        // Unset the entityId for the folder
        folder.entityId = undefined;
        // Walk the subfolders
        if (folder.folders) {
          walkFolders(folder.folders);
        }
        // Unset the entityId for each file in the folder
        folder.files.forEach(file => {
          file.entityId = undefined;
        });
      });
    };
    // walk each FolderGroup and unset the entityId on all folders and files
    codebookConfig.folderGroups?.forEach(group => {
      walkFolders(group.folders);
    });


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

  // entityId is a string that uniquely identifies the folder
  // it is not included in the json, so we'll allow it to be undefined
  entityId?: string;

  constructor(name: string, entityId?: string) {
    this.name = name;
    this.entityId = entityId;
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

  findFileByEntityId(entId: string): FolderGroupFile | undefined {
    const fileIndex = entityIdFileIndex(entId);
    if (fileIndex === -1) {
      console.error(`Invalid file ID format: ${entId}`);
      return undefined;
    }

    // Return the file at the specified index
    return this.files[fileIndex];
  }

  getAllFiles(): FolderGroupFile[] {
    return this.files;
  }
}

// entityIdIsFile checks if the entityId is a file with a simple check
// for the presence of square brackets
// The entityId is expected to be in the format "folderIndex[fileIndex]", e.g., "0.1[2]"
export function entityIdIsFile(entId: string): boolean {
  return entId.includes('[');
}


// entityIdFileIndex extracts the file index from the entityId
// The entityId is expected to be in the format "folderIndex[fileIndex]", e.g., "0.1[2]"
// If the entityId is not in the expected format, it returns -1
// If the entityId is a file, it returns the file index
// If the entityId is not a file, it returns -1
export function entityIdFileIndex(entId: string): number {
  // Check if the entityId is a file
  if (!entityIdIsFile(entId)) {
    return -1;
  }

  // Check for proper bracket format with no nested brackets
  const matches = entId.match(/\[(\d+)\]/);
  if (!matches || matches.length !== 2 || entId.indexOf('[') !== entId.lastIndexOf('[') ||
    entId.indexOf(']') !== entId.lastIndexOf(']')) {
    console.error(`Invalid file ID format: ${entId}`);
    return -1;
  }

  // Extract and validate the file index
  const index = parseInt(matches[1], 10);
  if (index < 0) {
    console.error(`Invalid file ID format: ${entId}`);
    return -1;
  }

  return index;
}

// FolderGroupEntity contains the parts from an entityId representing a folder or file
// in a FolderGroup.
// FolderGroup index, Folder path, and File index.
export class FolderGroupEntity {
  folderGroupIndex: number;
  folderPath: string;
  folderIndex: number;
  fileIndex: number;
  source: string;

  constructor(entId: string, source: string) {
    this.source = source;

    // Clean up the ID to remove potential 'folder-' or 'file-' prefixes
    const cleanId = entId.replace(/^(folder|file)-/, '');

    const parts = cleanId.split('-');
    if (parts.length < 2 || parts.length > 3) {
      throw new Error(`Invalid entityId format: ${entId}`);
    }

    // the first part is the FolderGroup index
    this.folderGroupIndex = parseInt(parts[0], 10);
    if (isNaN(this.folderGroupIndex)) {
      throw new Error(`Invalid index in entityId: ${entId}`);
    }

    // the second part is the Folder path (string)
    this.folderPath = parts[1];
    if (!this.folderPath) {
      throw new Error(`Invalid folder path in entityId: ${entId}`);
    }
    // the folder index is the last part of the folder path
    const folderParts = this.folderPath.split('.');
    this.folderIndex = parseInt(folderParts[folderParts.length - 1], 10);
    if (isNaN(this.folderIndex)) {
      throw new Error(`Invalid folder index in entityId: ${entId}`);
    }

    // the third part is the File index (number)
    // If there's no third part, it's a folder, so fileIndex = 0
    this.fileIndex = parts.length === 3 ? parseInt(parts[2], 10) : 0;
    if (isNaN(this.fileIndex)) {
      throw new Error(`Invalid file index in entityId: ${entId}`);
    }
  }

  idString(): string {
    return `${this.folderGroupIndex}-${this.folderPath}-${this.fileIndex}`;
  }

  stringify(): string {
    return `GroupIndex: ${this.folderGroupIndex}, FolderPath: ${this.folderPath}, FileIndex: ${this.fileIndex}`;
  }

  isFile(): boolean {
    return this.fileIndex > 0;
  }

  fileArrayIndex(): number {
    return this.fileIndex - 1;
  }

  isFolder(): boolean {
    return this.fileIndex === 0;
  }

  folderArrayIndex(): number {
    return this.folderIndex - 1;
  }

  getTargetFolder(): FolderGroupFolder | undefined {
    const folderGroup = this.getFolderGroup();
    if (!folderGroup) {
      console.error(`Folder group not found for index: ${this.folderGroupIndex}`);
      return;
    }
    const folder = folderGroup.findTargetFolderByEntityId(this.folderPath);
    return folder;
  }

  getTargetParentFolder(): FolderGroupFolder | undefined {
    const folderGroup = this.getFolderGroup();
    if (!folderGroup) {
      console.error(`Folder group not found for index: ${this.folderGroupIndex}`);
      return;
    }
    const folder = folderGroup.findTargetParentFolderByEntityId(this.folderPath);
    return folder;
  }

  folderGroupArrayIndex(): number {
    return this.folderGroupIndex - 1;
  }

  // getFolderGroup returns the folder group for this Entity
  getFolderGroup(): FolderGroup | undefined {
    const configPath = config.getCodebookConfigFilePath();
    if (!configPath) {
      console.error('Config path is undefined or empty');
      return undefined;
    }

    // Read the config file to get all folder groups
    const codebookConfig = readCodebookConfig(configPath);
    if (!codebookConfig.folderGroups || codebookConfig.folderGroups.length === 0) {
      console.log('No folder groups found in the config');
      return undefined;
    }

    // since the index starts at 1 in the notebooks view, we'll subtract 1 to use it as an array index
    const folderGroupArrayIndex = this.folderGroupArrayIndex();

    // Find the folder group that contains this file
    const groupData = codebookConfig.folderGroups[folderGroupArrayIndex];
    if (!groupData) {
      console.error(`Folder group not found for arrayIndex: ${folderGroupArrayIndex} | index: ${this.folderGroupIndex}`);
      return undefined;
    }

    // Create a proper FolderGroup instance to ensure all prototype methods are available
    const folderGroup = new FolderGroup(
      groupData.name,
      groupData.source || this.source,
      groupData.description || '',
      JSON.parse(JSON.stringify(groupData.folders || []))  // Deep clone the folders to ensure we're not modifying the original object
    );

    // Copy other properties from the loaded data
    folderGroup.index = groupData.index;
    folderGroup.icon = groupData.icon;
    folderGroup.hide = groupData.hide;

    // walk the folders and files to set the entityId on each
    // we'll start at the folderGroup.folders, then walk all the embedded folder.folders as well
    // template: {{folderGroupIndex}}-{{folder.tree.path}}-{{fileIndex}}
    // Base 1 index, not Base 0

    const walkFolders = (folders: FolderGroupFolder[], groupIndex: number) => {
      folders.forEach((folder, index) => {
        // Set the entityId for the folder
        folder.entityId = `${groupIndex + 1}-${index + 1}-0`;
        // Walk the subfolders
        if (folder.folders) {
          walkFolders(folder.folders, groupIndex);
        }
        // Set the entityId for each file in the folder
        folder.files.forEach((file, fileIndex) => {
          file.entityId = `${groupIndex + 1}-${index + 1}-${fileIndex + 1}`;
        });
      });
    };

    // Walk the folders and set the entityId for each folder and file
    walkFolders(folderGroup.folders, folderGroupArrayIndex);

    return folderGroup;
  }
}

// folderPathFromEntityId extracts the folder path from the entityId
export function entityIdFolderPath(entId: string): string | undefined {
  return entityIdIsFile(entId) ? entId.split('[')[0] : entId;
}

export class FolderGroupFile {
  name: string;
  path: string;

  // entityId is a string that uniquely identifies the folder
  // it is not included in the json, so we'll allow it to be undefined
  entityId?: string;

  constructor(name: string, path: string, entityId?: string) {
    this.name = name;
    this.path = path;
    this.entityId = entityId;
  }
}

// getWorkspaceFolderGroup is a convenience function to get the FolderGroup from the configuration
export function getWorkspaceFolderGroup(configPath: string): FolderGroup {
  // Validate the settings path to prevent downstream undefined errors
  if (!configPath) {
    console.error('Settings path is undefined or empty');
    // Return a new folder group with a default name, but ensure we're not using an undefined source
    return new FolderGroup('Workspace', '', '', []);
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
      workspaceGroup.description || '',
      workspaceGroup.folders || []
    );
    // Copy other properties
    folderGroup.index = workspaceGroup.index;
    folderGroup.icon = workspaceGroup.icon;
    folderGroup.hide = workspaceGroup.hide;

    return folderGroup;
  }

  return new FolderGroup('Workspace', configPath, '', []);
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
    .replace(/^\./, '') // Remove leading period
    .replace(/\.\w+$/, '') // Remove extension
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase words
    .split(/[_\-\s.]/) // Split by underscore, dash, space, or period
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter of each word
    .join(' ') // Join with spaces
    .trim(); // Trim any extra whitespace
}

export function getFolderGroupByIndex(configPath: string, groupIndex: number): FolderGroup | undefined {
  if (!configPath) {
    console.error('Config path is undefined or empty');
    return undefined;
  }

  // Read the config file to get all folder groups
  const codebookConfig = readCodebookConfig(configPath);
  if (!codebookConfig.folderGroups || codebookConfig.folderGroups.length === 0) {
    console.log('No folder groups found in the config');
    return undefined;
  }

  // Check if the group index is valid
  if (groupIndex < 0 || groupIndex >= codebookConfig.folderGroups.length) {
    console.error(`Invalid group index: ${groupIndex}`);
    return undefined;
  }

  // Get the folder group and create a proper FolderGroup instance
  const group = codebookConfig.folderGroups[groupIndex];
  const folderGroup = new FolderGroup(
    group.name,
    group.source || configPath,
    group.description || '',
    group.folders || []
  );

  // Copy other properties
  folderGroup.index = group.index;
  folderGroup.icon = group.icon;
  folderGroup.hide = group.hide;

  return folderGroup;
}

// findMarkdownContainingFolders finds all folders containing markdown files
// starting from the current file path and traversing up the directory tree
export function findMarkdownContainingFolders(startFilePath: string): { path: string, name: string; }[] {
  const result: { path: string, name: string; }[] = [];
  if (!startFilePath) {
    return result;
  }

  try {
    // Get the directory of the current file
    let currentDir = path.dirname(startFilePath);
    const workspaceFolder = config.getWorkspaceFolder();

    // Keep traversing up until we reach the workspace root or the root of the filesystem
    while (currentDir && currentDir !== path.dirname(currentDir) &&
      (workspaceFolder ? currentDir.startsWith(workspaceFolder) : true)) {

      // Check if the current directory contains markdown files
      if (directoryContainsMarkdownFiles(currentDir)) {
        result.push({
          path: currentDir,
          name: suggestedDisplayName(path.basename(currentDir))
        });
      }

      // Move up to the parent directory
      currentDir = path.dirname(currentDir);
    }

    return result;
  } catch (error) {
    console.error('Error finding markdown-containing folders:', error);
    return [];
  }
}

// directoryContainsMarkdownFiles checks if a directory contains markdown files
// at its root level (not in subdirectories)
function directoryContainsMarkdownFiles(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      return false;
    }

    const files = fs.readdirSync(dirPath);

    // Check if any file is a markdown file
    return files.some(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      // Only consider files (not directories) and check if they have a markdown extension
      return stats.isFile() &&
        (file.toLowerCase().endsWith('.md') || file.toLowerCase().endsWith('.markdown'));
    });
  } catch (error) {
    console.error(`Error checking directory for markdown files: ${dirPath}`, error);
    return false;
  }
}

// directoryContainsIncludedSubfolders checks if a directory contains any subfolders 
// that are in the inclusion list
function directoryContainsIncludedSubfolders(dirPath: string, inclusions: string[], exclusions: string[]): boolean {
  try {
    if (!fs.existsSync(dirPath) || !inclusions || inclusions.length === 0) {
      return false;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Check if any subfolder is in the inclusion list and not in the exclusion list
    return entries.some(entry =>
      entry.isDirectory() &&
      inclusions.includes(entry.name) &&
      !isExcluded(entry.name, exclusions)
    );
  } catch (error) {
    console.error(`Error checking directory for included subfolders: ${dirPath}`, error);
    return false;
  }
}

// addCurrentFolderIfNeeded adds the current directory to the folder group if it contains
// included subfolders with markdown files, even if it doesn't have markdown files itself
function addCurrentFolderIfNeeded(
  filePath: string,
  folderGroup: FolderGroup,
  inclusions: string[],
  exclusions: string[],
  workspacePath: string,
  existingFolders: { path: string, name: string; }[]
): void {
  try {
    // Get the directory of the current file
    const currentDir = path.dirname(filePath);

    // Skip if this folder is already included (has markdown files directly)
    if (existingFolders.some(folder => folder.path === currentDir)) {
      return;
    }

    // Check if the current directory contains any included subfolders
    if (!directoryContainsIncludedSubfolders(currentDir, inclusions, exclusions)) {
      return;
    }

    // Create folder for current directory
    const folderName = suggestedDisplayName(path.basename(currentDir));
    const folderIndex = folderGroup.folders.length + 1; // Next available index
    const folderGroupFolder = new FolderGroupFolder(folderName, `dynamic-${folderIndex}-0`);

    // No markdown files to add directly as this folder doesn't have any

    // Add included subfolders
    addIncludedSubFolders(
      currentDir,
      folderGroupFolder,
      inclusions,
      exclusions,
      workspacePath
    );

    // Only add this folder if subfolders with markdown files were found
    // This is determined by checking if any subfolders were added
    if (folderGroupFolder.folders.length > 0) {
      folderGroup.folders.push(folderGroupFolder);
    }
  } catch (error) {
    console.error('Error adding current folder:', error);
  }
}

// createDynamicFolderGroupFromPath creates a dynamic folder group based on the current file
export function createDynamicFolderGroupFromPath(filePath: string): FolderGroup | undefined {
  if (!filePath) {
    return undefined;
  }

  // Get dynamic folder group configuration
  const dynamicConfig = config.getDynamicFolderGroupConfig();

  // If dynamic folder group is disabled, return undefined
  if (!dynamicConfig.enabled) {
    return undefined;
  }

  try {
    // Create a new folder group using configuration values
    const folderGroup = new FolderGroup(
      dynamicConfig.name,
      '', // No source file as this is dynamic
      dynamicConfig.description,
      [] // Start with empty folders array
    );

    // Get the workspace path
    const workspacePath = config.getWorkspaceFolder() || '';

    // Find and process folders containing markdown files
    const markdownFolders = findMarkdownContainingFolders(filePath);

    // Find parent folders with included subfolders containing markdown files
    const parentFoldersWithInclusions: { path: string, name: string; }[] = [];
    if (dynamicConfig.subFolderInclusions && dynamicConfig.subFolderInclusions.length > 0) {
      const extraFolders = findParentFoldersWithIncludedSubfolders(
        filePath,
        dynamicConfig.subFolderInclusions,
        dynamicConfig.exclusions
      );

      // Add to our list of folders to process, avoiding duplicates
      extraFolders.forEach(folder => {
        if (!markdownFolders.some(mf => mf.path === folder.path) &&
          !parentFoldersWithInclusions.some(pf => pf.path === folder.path)) {
          parentFoldersWithInclusions.push(folder);
        }
      });
    }

    // Process all folders with markdown files
    const allFolders = [...markdownFolders, ...parentFoldersWithInclusions];
    allFolders.forEach((folder, index) => {
      const folderGroupFolder = new FolderGroupFolder(folder.name, `dynamic-${index + 1}-0`);

      // Find all markdown files in this folder and respect exclusions
      const markdownFiles = findMarkdownFilesInDirectory(folder.path, dynamicConfig.exclusions);

      // Add these files to the folder
      markdownFiles.forEach((file, fileIndex) => {
        // Create relative path from workspace
        const relativePath = path.relative(workspacePath, file.path);
        folderGroupFolder.files.push(
          new FolderGroupFile(
            file.name,
            relativePath,
            `dynamic-${index + 1}-${fileIndex + 1}`
          )
        );
      });

      // Check for sub-folders if configured
      if (dynamicConfig.subFolderInclusions && dynamicConfig.subFolderInclusions.length > 0) {
        addIncludedSubFolders(
          folder.path,
          folderGroupFolder,
          dynamicConfig.subFolderInclusions,
          dynamicConfig.exclusions,
          workspacePath
        );
      }

      folderGroup.folders.push(folderGroupFolder);
    });

    // Handle the current folder even if it doesn't contain markdown files directly
    // but might have included subfolders with markdown files
    if (dynamicConfig.subFolderInclusions && dynamicConfig.subFolderInclusions.length > 0) {
      addCurrentFolderIfNeeded(
        filePath,
        folderGroup,
        dynamicConfig.subFolderInclusions,
        dynamicConfig.exclusions,
        workspacePath,
        allFolders // Use the combined list to avoid duplicates
      );
    }

    // Clean up any empty folders in the dynamic structure
    // This ensures we don't display folders that have no markdown files or valuable subfolders
    if (folderGroup.folders && folderGroup.folders.length > 0) {
      folderGroup.folders = cleanupEmptyFolders(folderGroup.folders);
    }

    // Don't return an empty folder group
    if (!folderGroup.folders || folderGroup.folders.length === 0) {
      return undefined;
    }

    // Set special properties to identify this as a dynamic folder group
    folderGroup.isDynamic = true;

    return folderGroup;
  } catch (error) {
    console.error('Error creating dynamic folder group:', error);
    return undefined;
  }
}

// Helper function to add included sub-folders to a folder group folder
function addIncludedSubFolders(
  basePath: string,
  parentFolder: FolderGroupFolder,
  inclusions: string[],
  exclusions: string[],
  workspacePath: string
): void {
  try {
    if (!fs.existsSync(basePath)) {
      return;
    }

    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const subFolders = entries.filter(entry =>
      entry.isDirectory() &&
      inclusions.includes(entry.name) &&
      !isExcluded(entry.name, exclusions)
    );

    subFolders.forEach((subFolder, index) => {
      const subFolderPath = path.join(basePath, subFolder.name);
      const subFolderGroupFolder = new FolderGroupFolder(
        suggestedDisplayName(subFolder.name),
        `${parentFolder.entityId}.${index + 1}`
      );

      // Find markdown files in this subfolder
      const markdownFiles = findMarkdownFilesInDirectory(subFolderPath, exclusions);

      // Add files to the subfolder
      markdownFiles.forEach((file, fileIndex) => {
        const relativePath = path.relative(workspacePath, file.path);
        subFolderGroupFolder.files.push(
          new FolderGroupFile(
            file.name,
            relativePath,
            `${subFolderGroupFolder.entityId}-${fileIndex + 1}`
          )
        );
      });

      // Always add the subfolder if it's in the inclusions list,
      // even if it doesn't contain any markdown files directly
      parentFolder.folders.push(subFolderGroupFolder);

      // Recursively scan for nested subfolders
      if (inclusions.length > 0) {
        addIncludedSubFolders(
          subFolderPath,
          subFolderGroupFolder,
          inclusions,
          exclusions,
          workspacePath
        );
      }
    });
  } catch (error) {
    console.error(`Error adding included sub-folders for ${basePath}:`, error);
  }
}

// Helper function to check if a path is excluded
function isExcluded(pathToCheck: string, exclusions: string[]): boolean {
  if (!exclusions || exclusions.length === 0) {
    return false;
  }

  return exclusions.some(exclusion => {
    // Simple glob-like pattern matching for * wildcard
    const pattern = exclusion.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(pathToCheck);
  });
}

// findMarkdownFilesInDirectory finds all markdown files in a directory (not recursive)
function findMarkdownFilesInDirectory(
  dirPath: string,
  exclusions: string[] = []
): { path: string, name: string; }[] {
  const result: { path: string, name: string; }[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      return result;
    }

    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      // Skip if file/folder name is in exclusions
      if (isExcluded(file, exclusions)) {
        return;
      }

      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile() &&
        (file.toLowerCase().endsWith('.md') || file.toLowerCase().endsWith('.markdown'))) {
        result.push({
          path: filePath,
          name: suggestedDisplayName(file)
        });
      }
    });

    return result;
  } catch (error) {
    console.error(`Error finding markdown files in directory: ${dirPath}`, error);
    return [];
  }
}

// cleanupEmptyFolders recursively removes empty folders from a dynamic folder group
// A folder is considered empty if it has no files and no non-empty subfolders
function cleanupEmptyFolders(folders: FolderGroupFolder[]): FolderGroupFolder[] {
  if (!folders || folders.length === 0) {
    return [];
  }

  return folders.filter(folder => {
    // First, recursively clean up subfolders if they exist
    if (folder.folders && folder.folders.length > 0) {
      const cleanedSubfolders = cleanupEmptyFolders(folder.folders);
      // Update the folder's subfolders with the cleaned result
      folder.folders = cleanedSubfolders;
    }

    // A folder should be kept if it has any files
    if (folder.files && folder.files.length > 0) {
      return true;
    }

    // A folder should be kept if it has any remaining subfolders after cleanup
    if (folder.folders && folder.folders.length > 0) {
      return true;
    }

    // If we reach here, the folder is empty (no files, no subfolders after cleanup)
    // so we should filter it out
    return false;
  });
}

// findParentFoldersWithIncludedSubfolders finds parent folders that have subfolders
// from the inclusion list containing markdown files, even if the parent folder itself
// doesn't directly contain markdown files
export function findParentFoldersWithIncludedSubfolders(
  startFilePath: string,
  inclusions: string[],
  exclusions: string[]
): { path: string, name: string; }[] {
  const result: { path: string, name: string; }[] = [];
  if (!startFilePath || !inclusions || inclusions.length === 0) {
    return result;
  }

  try {
    // Get the directory of the current file
    let currentDir = path.dirname(startFilePath);
    const workspaceFolder = config.getWorkspaceFolder();

    // Keep traversing up until we reach the workspace root or the root of the filesystem
    while (currentDir && currentDir !== path.dirname(currentDir) &&
      (workspaceFolder ? currentDir.startsWith(workspaceFolder) : true)) {

      // Check if the current directory contains any included subfolders with markdown files
      if (hasIncludedSubfoldersWithMarkdown(currentDir, inclusions, exclusions)) {
        // Only add if not already in the result (to avoid duplicates)
        if (!result.some(folder => folder.path === currentDir)) {
          result.push({
            path: currentDir,
            name: suggestedDisplayName(path.basename(currentDir))
          });
        }
      }

      // Move up to the parent directory
      currentDir = path.dirname(currentDir);
    }

    return result;
  } catch (error) {
    console.error('Error finding parent folders with included subfolders:', error);
    return [];
  }
}

// hasIncludedSubfoldersWithMarkdown checks if a directory contains any subfolders
// from the inclusion list that have markdown files
function hasIncludedSubfoldersWithMarkdown(
  dirPath: string,
  inclusions: string[],
  exclusions: string[]
): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      return false;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Check each subfolder in the inclusions list
    for (const entry of entries) {
      if (!entry.isDirectory() ||
        !inclusions.includes(entry.name) ||
        isExcluded(entry.name, exclusions)) {
        continue;
      }

      const subFolderPath = path.join(dirPath, entry.name);

      // Check if the subfolder contains markdown files
      if (directoryContainsMarkdownFiles(subFolderPath)) {
        return true;
      }

      // Recursively check nested subfolders
      if (hasIncludedSubfoldersWithMarkdown(subFolderPath, inclusions, exclusions)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking for included subfolders with markdown in: ${dirPath}`, error);
    return false;
  }
}
