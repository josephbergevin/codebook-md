import { window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const codebookConfig = workspace.getConfiguration('codebook-md');

// basePath is the workspace root path
const rootPath = codebookConfig.get('rootPath', '');

export interface TreeViewFolderEntry {
  name: string;
  folders?: TreeViewFolderEntry[];
  files?: TreeViewFileEntry[];
  icon?: string;
  hide?: boolean;
}

export interface TreeViewFileEntry {
  name: string;
  path: string;
}

export interface CodebookMdConfig {
  rootPath: string;
  tempPath: string;
  permalinkPrefix: string;
  treeView: {
    folders: TreeViewFolderEntry[];
  };
  go: {
    execType: 'run' | 'test';
    execTypeRunFilename: string;
    execTypeTestFilename: string;
    execTypeTestBuildTag: string;
    goimportsCmd: 'gopls imports' | 'goimports';
  };
}

export function readConfig(): CodebookMdConfig {
  const tempPath = codebookConfig.get('tempPath', '');
  const currentFile = window.activeTextEditor?.document.fileName ?? '';
  const treeViewFolders = codebookConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

  return {
    rootPath: rootPath,
    tempPath: fullTempPath(tempPath, currentFile, rootPath),
    permalinkPrefix: codebookConfig.get('permalinkPrefix', ''),
    treeView: {
      folders: treeViewFolders,
    },
    go: {
      execType: codebookConfig.get('go.execType', 'run'),
      execTypeRunFilename: codebookConfig.get('go.execTypeRunFilename', 'main.go'),
      execTypeTestFilename: codebookConfig.get('go.execTypeTestFilename', 'codebook_md_exec_test.go'),
      execTypeTestBuildTag: codebookConfig.get('go.execTypeTestBuildTag', 'codebook_md_exec'),
      goimportsCmd: codebookConfig.get('go.goimportsCmd', 'gopls imports'),
    },
  };
}

// getTempPath is a convenience function to get the tempPath from the configuration
export function getTempPath(): string {
  return readConfig().tempPath;
}

// getTreeViewFolders is a convenience function to get the tree view folders from the configuration
// Merges settings from both user and workspace configurations
export function getTreeViewFolders(settingsPath: string): TreeViewFolderEntry[] {
  // Get workspace settings from the given settings path
  const vscodeSettings = readVSCodeSettings(settingsPath);

  // Check both possible configuration paths
  const workspaceFolders =
    vscodeSettings['codebook-md.treeView']?.folders ||
    vscodeSettings['codebook-md']?.treeView?.folders ||
    [];

  // Get user settings from VS Code configuration API
  const userConfig = workspace.getConfiguration('codebook-md');
  const userFolders = userConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

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

  return mergedFolders;
}

export function fullTempPath(tempPath: string, currentFile: string, workspacePath: string): string {
  if (tempPath === '' && workspacePath !== '') {
    return workspacePath;
  } else if (tempPath.startsWith('./')) {
    const currentPath = path.dirname(currentFile ?? '');
    return path.join(currentPath, tempPath.slice(2));
  }
  return tempPath;
}

// getFullPath returns the full path for a potentially relative path
// If the path is absolute, it is returned as-is
// If the path is relative, it is resolved relative to the workspace root
export function getFullPath(filePath: string, workspacePath: string): string {
  if (!workspacePath) {
    return filePath.replace(/\\/g, '/');
  }

  // Helper to convert to forward slashes
  const toForwardSlashes = (p: string) => p.replace(/\\/g, '/');

  // First convert any backslashes to forward slashes
  const normalizedFilePath = toForwardSlashes(path.normalize(filePath));
  const normalizedWorkspacePath = toForwardSlashes(path.normalize(workspacePath));

  // If it's already relative, resolve against workspace then make relative again
  if (!path.isAbsolute(normalizedFilePath)) {
    const resolvedPath = toForwardSlashes(path.resolve(normalizedWorkspacePath, normalizedFilePath));
    // If the resolved path starts with workspace path, make it relative
    if (resolvedPath.startsWith(normalizedWorkspacePath + '/')) {
      return toForwardSlashes(path.relative(normalizedWorkspacePath, resolvedPath));
    }
    return normalizedFilePath;
  }

  // For absolute paths, if they're in the workspace, make them relative
  if (normalizedFilePath.startsWith(normalizedWorkspacePath + '/')) {
    return toForwardSlashes(path.relative(normalizedWorkspacePath, normalizedFilePath));
  }

  // Otherwise return the normalized absolute path
  return normalizedFilePath;
}

// Type for VS Code settings
interface VSCodeSettings {
  'codebook-md'?: {
    treeView?: {
      folders: TreeViewFolderEntry[];
    };
    [key: string]: unknown;
  };
  'codebook-md.treeView'?: {
    folders: TreeViewFolderEntry[];
  };
  [key: string]: unknown;
}

// Helper function to get the settings file path
export function getVSCodeSettingsFilePath(): string {
  return workspace.workspaceFolders?.[0]
    ? path.join(workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json')
    : '';
}

// Helper function to read the given settings path
export function readVSCodeSettings(settingsPath: string): VSCodeSettings {
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
export function updateTreeViewSettings(folders: TreeViewFolderEntry[], settingsPath: string): void {
  try {
    if (!settingsPath) {
      throw new Error('No workspace folder found');
    }

    // Read existing settings
    const existingSettings = readVSCodeSettings(settingsPath);

    // Update only the codebook-md.treeView section
    const updatedSettings = {
      ...existingSettings,
      'codebook-md.treeView': {
        folders: folders
      }
    };

    // Create settings directory if it doesn't exist
    const vscodeDirPath = path.dirname(settingsPath);
    if (!fs.existsSync(vscodeDirPath)) {
      fs.mkdirSync(vscodeDirPath, { recursive: true });
    }

    // Read existing content to preserve formatting and comments
    let existingContent = '';
    if (fs.existsSync(settingsPath)) {
      existingContent = fs.readFileSync(settingsPath, 'utf8');
    }

    // Preserve formatting from existing content
    const indent = existingContent.match(/^\s+/m)?.[0] || '  ';

    // Preserve any leading comments
    const commentMatch = existingContent.match(/^([\s\S]*?)\{/);
    const leadingContent = commentMatch ? commentMatch[1] : '';

    // Write the updated settings while preserving comments and formatting
    const content = leadingContent + JSON.stringify(updatedSettings, null, indent);
    fs.writeFileSync(settingsPath, content, 'utf8');
  } catch (err) {
    const error = err as Error;
    console.error('Failed to update tree view settings:', error);
    window.showErrorMessage(`Failed to update tree view settings: ${error.message}`);
  }
}

// getWorkspaceFolder returns the actual workspace folder path
export function getWorkspaceFolder(): string {
  const rootPathSetting = codebookConfig.get<string>('rootPath', '');

  // If rootPath contains ${workspaceFolder}, replace it with actual workspace path
  if (rootPathSetting.includes('${workspaceFolder}')) {
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }
    return rootPathSetting.replace('${workspaceFolder}', workspaceFolder);
  }

  // If rootPath is set and doesn't contain placeholder, use it
  if (rootPathSetting) {
    return rootPathSetting;
  }

  // Fall back to first workspace folder
  const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error('No workspace folder found');
  }

  return workspaceFolder;
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
