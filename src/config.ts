import { window, workspace } from 'vscode';
import * as path from 'path';

// Helper to get the primary workspace folder path
function getPrimaryWorkspaceFolderPath(): string | undefined {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    return workspace.workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

// Module-level configuration accessor
const codebookConfig = workspace.getConfiguration('codebook-md');

// Revised function to resolve execPath to an absolute path
function resolveToAbsolutePath(execPathSetting: string, currentFilePath?: string, workspaceFolderPath?: string): string {
  let resolvedPath: string;

  if (path.isAbsolute(execPathSetting)) {
    resolvedPath = execPathSetting;
  } else if (execPathSetting.startsWith('./') || execPathSetting.startsWith('../')) {
    // For paths like './foo' or '../bar'
    const baseDir = currentFilePath ? path.dirname(currentFilePath) : workspaceFolderPath;
    if (baseDir) {
      resolvedPath = path.resolve(baseDir, execPathSetting);
    } else {
      throw new Error(`Cannot resolve relative execPath "${execPathSetting}" starting with './' or '../' without an active file or workspace folder.`);
    }
  } else {
    // For paths like 'foo' or 'foo/bar' (not starting with ./ or ../)
    if (workspaceFolderPath) {
      resolvedPath = path.resolve(workspaceFolderPath, execPathSetting);
    } else {
      throw new Error(`Cannot resolve relative execPath "${execPathSetting}" (not starting with './' or '../') without a workspace folder.`);
    }
  }
  return path.normalize(resolvedPath); // Normalize to clean up (e.g. /./ -> /)
}

// getExecPath is a convenience function to get the execPath from the configuration
export function getExecPath(): string {
  // Default from package.json is "./codebook-md-exec/"
  const execPathSetting = codebookConfig.get<string>('execPath', "./codebook-md-exec/");
  const currentFile = window.activeTextEditor?.document.fileName; // Can be undefined

  // Determine the workspace path to use for resolving execPath.
  // Priority:
  // 1. 'codebook-md.rootPath' setting (if absolute).
  // 2. 'codebook-md.rootPath' setting (if relative, resolve against primary workspace folder).
  // 3. Primary workspace folder path.
  let wsPathForResolution: string | undefined;
  const rootPathSetting = codebookConfig.get<string>('rootPath', '');

  if (rootPathSetting) {
    if (path.isAbsolute(rootPathSetting)) {
      wsPathForResolution = rootPathSetting;
    } else {
      // rootPathSetting is relative, try to resolve it against the primary workspace folder.
      const primaryWs = getPrimaryWorkspaceFolderPath();
      if (primaryWs) {
        wsPathForResolution = path.resolve(primaryWs, rootPathSetting);
      }
      // If rootPathSetting is relative but no primaryWs, wsPathForResolution remains undefined.
      // resolveToAbsolutePath will handle this scenario.
    }
  } else {
    // No rootPathSetting provided, use the primary workspace folder path.
    wsPathForResolution = getPrimaryWorkspaceFolderPath();
  }

  try {
    return resolveToAbsolutePath(execPathSetting, currentFile, wsPathForResolution);
  } catch (e: unknown) {
    let errorMessage = `Failed to determine execution path for setting "${execPathSetting}"`;
    if (e instanceof Error) {
      errorMessage += `: ${e.message}`;
    }
    console.error(errorMessage, e); // Log for debugging
    window.showErrorMessage(errorMessage); // Inform the user
    // Re-throw so the caller (e.g., language cell constructor) knows this critical path determination failed.
    throw new Error(errorMessage);
  }
}

// export function fullExecPath(execPath: string, currentFile: string, workspacePath: string): string {
//   const execPathSetting = codebookConfig.get<string>('execPath', "./codebook-md-exec/");
//   return resolveToAbsolutePath(execPathSetting, currentFile, workspacePath);
// }

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
