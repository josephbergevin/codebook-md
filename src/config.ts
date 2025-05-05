import { window, workspace } from 'vscode';
import * as path from 'path';

const codebookConfig = workspace.getConfiguration('codebook-md');

// basePath is the workspace root path
const rootPath = codebookConfig.get('rootPath', '');

// getExecPath is a convenience function to get the execPath from the configuration
export function getExecPath(): string {
  const execPath = codebookConfig.get('execPath', '');
  const currentFile = window.activeTextEditor?.document.fileName ?? '';
  return fullExecPath(execPath, currentFile, rootPath);
}

export function fullExecPath(execPath: string, currentFile: string, workspacePath: string): string {
  if (execPath === '' && workspacePath !== '') {
    return workspacePath;
  } else if (execPath.startsWith('./')) {
    const currentPath = path.dirname(currentFile ?? '');
    return path.join(currentPath, execPath.slice(2));
  }
  return execPath;
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

// Helper function to get the settings file path
export function getCodebookConfigFilePath(): string {
  return workspace.workspaceFolders?.[0]
    ? path.join(workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'codebook-md.json')
    : '';
}

// Get dynamic folder group settings
export interface DynamicFolderGroupConfig {
  enabled: boolean;
  name: string;
  description: string;
  subFolderInclusions: string[];
  exclusions: string[];
}

// getDynamicFolderGroupConfig returns the configuration for the dynamic folder group
export function getDynamicFolderGroupConfig(): DynamicFolderGroupConfig {
  const config = workspace.getConfiguration('codebook-md');

  // Get the dynamic folder group settings with defaults
  return {
    enabled: config.get<boolean>('dynamicFolderGroup.enabled', true),
    name: config.get<string>('dynamicFolderGroup.name', 'Current Context'),
    description: config.get<string>('dynamicFolderGroup.description', 'Auto-generated based on the current file'),
    subFolderInclusions: config.get<string[]>('dynamicFolderGroup.subFolderInclusions', []),
    exclusions: config.get<string[]>('dynamicFolderGroup.exclusions', ['node_modules', 'out', 'dist'])
  };
}

// isDynamicFolderGroupEnabled returns whether the dynamic folder group is enabled
export function isDynamicFolderGroupEnabled(): boolean {
  return getDynamicFolderGroupConfig().enabled;
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
