import { window, workspace } from 'vscode';
import * as path from 'path';

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
// Always reads directly from the configuration to avoid caching issues
export function getTreeViewFolders(): TreeViewFolderEntry[] {
  // Always get fresh configuration data
  const freshConfig = workspace.getConfiguration('codebook-md');
  return freshConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);
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
