import { window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const config = workspace.getConfiguration('codebook-md');

// basePath is the workspace root path
const rootPath = config.get('rootPath', '');

export interface TreeViewFolderEntry {
  name: string;
  folderPath: string;
  icon?: string;
  hide?: boolean;
  files?: TreeViewFileEntry[];
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
  const tempPath = config.get('tempPath', '');
  const currentFile = window.activeTextEditor?.document.fileName ?? '';
  const treeViewFolders = config.get<TreeViewFolderEntry[]>('treeView.folders', []);

  return {
    rootPath: rootPath,
    tempPath: fullTempPath(tempPath, currentFile, rootPath),
    permalinkPrefix: config.get('permalinkPrefix', ''),
    treeView: {
      folders: treeViewFolders,
    },
    go: {
      execType: config.get('go.execType', 'run'),
      execTypeRunFilename: config.get('go.execTypeRunFilename', 'main.go'),
      execTypeTestFilename: config.get('go.execTypeTestFilename', 'codebook_md_exec_test.go'),
      execTypeTestBuildTag: config.get('go.execTypeTestBuildTag', 'codebook_md_exec'),
      goimportsCmd: config.get('go.goimportsCmd', 'gopls imports'),
    },
  };
}

// getTempPath is a convenience function to get the tempPath from the configuration
export function getTempPath(): string {
  return readConfig().tempPath;
}

// getTreeViewFolders is a convenience function to get the tree view folders from the configuration
// Merges settings from both user and workspace configurations
export function getTreeViewFolders(): TreeViewFolderEntry[] {
  // Get user settings
  const userConfig = workspace.getConfiguration('codebook-md', null);
  const userFolders = userConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

  // Get workspace settings
  const workspaceConfig = workspace.getConfiguration('codebook-md', workspace.workspaceFolders?.[0].uri);
  const workspaceFolders = workspaceConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

  // Get .vscode/settings.json settings if it exists
  const vscodeSettings = readVSCodeSettings();
  const vscodeFolders = vscodeSettings['codebook-md.treeView']?.folders || [];

  // Merge folders from all sources, workspace settings takes precedence over user settings
  // .vscode/settings.json takes precedence over workspace settings
  const mergedFolders = [...userFolders];

  // Merge workspace folders
  for (const wsFolder of workspaceFolders) {
    const existingIndex = mergedFolders.findIndex(f => f.folderPath === wsFolder.folderPath);
    if (existingIndex >= 0) {
      mergedFolders[existingIndex] = { ...mergedFolders[existingIndex], ...wsFolder };
    } else {
      mergedFolders.push(wsFolder);
    }
  }

  // Merge .vscode/settings.json folders
  for (const vsFolder of vscodeFolders) {
    const existingIndex = mergedFolders.findIndex(f => f.folderPath === vsFolder.folderPath);
    if (existingIndex >= 0) {
      mergedFolders[existingIndex] = { ...mergedFolders[existingIndex], ...vsFolder };
    } else {
      mergedFolders.push(vsFolder);
    }
  }

  return mergedFolders;
}

// normalizeFolderPath standardizes the folderPath format by converting slashes to dots
// and ensuring there's no leading/trailing separator
export function normalizeFolderPath(folderPath?: string): string {
  if (!folderPath) {
    return 'root';
  }

  // Replace slashes with dots and remove any leading/trailing separators
  const normalized = folderPath.replace(/\//g, '.').replace(/^\.+|\.+$/g, '');
  return normalized || 'root';
}

// parseFolderPath splits a folderPath into its path segments
export function parseFolderPath(folderPath?: string): string[] {
  const normalized = normalizeFolderPath(folderPath);
  if (normalized === 'root') {
    return [];
  }
  return normalized.split('.');
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
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspacePath, filePath);
}

// Type for VS Code settings
interface VSCodeSettings {
  'codebook-md.treeView'?: {
    folders: TreeViewFolderEntry[];
  };
  [key: string]: unknown;
}

// Helper function to read .vscode/settings.json
export function readVSCodeSettings(): VSCodeSettings {
  const vscodeSettingsPath = workspace.workspaceFolders?.[0]
    ? path.join(workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json')
    : null;

  if (!vscodeSettingsPath) {
    return {};
  }

  try {
    if (!fs.existsSync(vscodeSettingsPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(vscodeSettingsPath, 'utf8'));
  } catch (error) {
    console.error('Error reading .vscode/settings.json:', error);
    return {};
  }
}

// Helper function to write to .vscode/settings.json
export function writeVSCodeSettings(settings: VSCodeSettings): void {
  const vscodeSettingsPath = workspace.workspaceFolders?.[0]
    ? path.join(workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json')
    : null;

  if (!vscodeSettingsPath) {
    throw new Error('No workspace folder found');
  }

  try {
    // Create .vscode directory if it doesn't exist
    const vscodeDirPath = path.dirname(vscodeSettingsPath);
    if (!fs.existsSync(vscodeDirPath)) {
      fs.mkdirSync(vscodeDirPath, { recursive: true });
    }

    // Format the JSON with 2 spaces indentation
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(vscodeSettingsPath, content, 'utf8');
  } catch (error) {
    console.error('Error writing .vscode/settings.json:', error);
    throw error;
  }
}

// Helper function to update tree view settings in .vscode/settings.json
export function updateTreeViewSettings(folders: TreeViewFolderEntry[]): void {
  const settings = readVSCodeSettings();
  settings['codebook-md.treeView'] = { folders };
  writeVSCodeSettings(settings);
}
