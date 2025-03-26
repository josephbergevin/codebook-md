import * as fs from 'fs';
import * as path from 'path';
import { window, workspace } from 'vscode';

export interface FolderGroup {
  name: string;
  source?: string;
  icon?: string;
  hide?: boolean;
  folders: FolderGroupFolder[];
}

export interface FolderGroupFolder {
  name: string;
  folders?: FolderGroupFolder[];
  files?: FolderGroupFile[];
  icon?: string;
  hide?: boolean;
}

export interface FolderGroupFile {
  name: string;
  path: string;
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

  return {
    name: 'Codebook',
    source: settingsPath,
    icon: 'folder',
    hide: false,
    folders: mergedFolders,
  };
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
