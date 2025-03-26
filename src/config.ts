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
  const vscodeSettings = readVSCodeSettings(settingsPath);
  const vscodeFolders = vscodeSettings['codebook-md.treeView']?.folders || [];
  return vscodeFolders;
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

// Helper function for deep merging objects
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target } as T;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        const targetValue = output[key] as Record<string, unknown>;
        output[key] = deepMerge(
          (targetValue || {}) as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        output[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return output;
}

// Helper function to get the settings file path
export function getVSCodeSettingsFilePath(): string {
  return workspace.workspaceFolders?.[0]
    ? path.join(workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json')
    : '';
}

// Helper function to read .vscode/settings.json
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
    console.error('Error reading .vscode/settings.json:', error);
    return {};
  }
}

// Helper function to write to .vscode/settings.json
export function writeVSCodeSettings(settings: VSCodeSettings): void {
  const settingsPath = getVSCodeSettingsFilePath();

  if (!settingsPath) {
    throw new Error('No workspace folder found');
  }

  try {
    // Create .vscode directory if it doesn't exist
    const vscodeDirPath = path.dirname(settingsPath);
    if (!fs.existsSync(vscodeDirPath)) {
      fs.mkdirSync(vscodeDirPath, { recursive: true });
    }

    let existingContent = '';
    if (fs.existsSync(settingsPath)) {
      existingContent = fs.readFileSync(settingsPath, 'utf8');
    }

    // If there's existing content, try to preserve comments and formatting
    if (existingContent) {
      try {
        const existingSettings = JSON.parse(existingContent);
        // Use deep merge instead of shallow merge
        const mergedSettings = deepMerge(existingSettings, settings);
        // Keep the original formatting by using the same whitespace
        const match = existingContent.match(/^\s+/m);
        const indent = match ? match[0] : '  ';
        // Preserve any leading comments by keeping everything before the first {
        const commentMatch = existingContent.match(/^([\s\S]*?)\{/);
        const leadingContent = commentMatch ? commentMatch[1] : '';
        const content = leadingContent + JSON.stringify(mergedSettings, null, indent);
        fs.writeFileSync(settingsPath, content, 'utf8');
        console.log('writeVSCodeSettings: wrote merged settings.json with preserved formatting');
      } catch (parseError) {
        // If parsing fails, fall back to simple merge
        console.error('Error writeVSCodeSettings: parsing existing settings:', parseError);
        const content = JSON.stringify(settings, null, 2);
        fs.writeFileSync(settingsPath, content, 'utf8');
        console.log('writeVSCodeSettings: wrote settings.json with standard formatting');
      }
    } else {
      // For new files, use standard formatting
      const content = JSON.stringify(settings, null, 2);
      fs.writeFileSync(settingsPath, content, 'utf8');
      console.log('writeVSCodeSettings: wrote new settings.json with standard formatting');
    }
  } catch (error) {
    console.error('Error writeVSCodeSettings: writing .vscode/settings.json:', error);
    throw error;
  }
}

// Helper function to update tree view settings in .vscode/settings.json
export function updateTreeViewSettings(folders: TreeViewFolderEntry[]): void {
  try {
    const settingsPath = getVSCodeSettingsFilePath();
    const settings = readVSCodeSettings(settingsPath);

    // Only update the codebook-md.treeView format
    settings['codebook-md.treeView'] = {
      ...settings['codebook-md.treeView'],
      folders: folders
    };

    writeVSCodeSettings(settings);
  } catch (error) {
    console.error('Failed to update tree view settings:', error);
    window.showErrorMessage(`Failed to update tree view settings: ${(error as Error).message}`);
  }
}

// getWorkspaceFolder returns the actual workspace folder path
// It handles "${workspaceFolder}" placeholder and falls back to the first workspace folder
export function getWorkspaceFolder(): string {
  const configRootPath = codebookConfig.get('rootPath', '');

  console.log(`configRootPath: ${configRootPath}`);
  console.log('Workspace folders:', workspace.workspaceFolders);

  // If rootPath contains ${workspaceFolder}, replace it with actual workspace path
  if (configRootPath.includes('${workspaceFolder}')) {
    // print debug all workspace folders
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }
    console.log(`Replacing ${configRootPath} with ${workspaceFolder}`);
    return configRootPath.replace('${workspaceFolder}', workspaceFolder);
  }

  // If rootPath is set and doesn't contain placeholder, use it
  if (configRootPath) {
    console.log(`Using rootPath: ${configRootPath}`);
    return configRootPath;
  }

  // Fall back to first workspace folder
  const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error('No workspace folder found');
  }

  console.log(`Using first workspace folder: ${workspaceFolder}`);
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
