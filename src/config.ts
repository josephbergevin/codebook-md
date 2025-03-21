import { window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const config = workspace.getConfiguration('codebook-md');

// basePath is the workspace root path
const rootPath = config.get('rootPath', '');

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
  const userConfig = workspace.getConfiguration('codebook-md', null);
  const userFolders = userConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

  const workspaceConfig = workspace.getConfiguration('codebook-md', workspace.workspaceFolders?.[0].uri);
  const workspaceFolders = workspaceConfig.get<TreeViewFolderEntry[]>('treeView.folders', []);

  const vscodeSettings = readVSCodeSettings();
  const vscodeFolders = vscodeSettings['codebook-md.treeView']?.folders || [];

  const mergedFolders = [...userFolders];

  for (const wsFolder of workspaceFolders) {
    const existingIndex = mergedFolders.findIndex(f => f.name === wsFolder.name);
    if (existingIndex >= 0) {
      mergedFolders[existingIndex] = { ...mergedFolders[existingIndex], ...wsFolder };
    } else {
      mergedFolders.push(wsFolder);
    }
  }

  for (const vsFolder of vscodeFolders) {
    const existingIndex = mergedFolders.findIndex(f => f.name === vsFolder.name);
    if (existingIndex >= 0) {
      mergedFolders[existingIndex] = { ...mergedFolders[existingIndex], ...vsFolder };
    } else {
      mergedFolders.push(vsFolder);
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
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspacePath, filePath);
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

    let existingContent = '';
    if (fs.existsSync(vscodeSettingsPath)) {
      existingContent = fs.readFileSync(vscodeSettingsPath, 'utf8');
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
        fs.writeFileSync(vscodeSettingsPath, content, 'utf8');
      } catch (parseError) {
        // If parsing fails, fall back to simple merge
        console.error('Error parsing existing settings:', parseError);
        const content = JSON.stringify(settings, null, 2);
        fs.writeFileSync(vscodeSettingsPath, content, 'utf8');
      }
    } else {
      // For new files, use standard formatting
      const content = JSON.stringify(settings, null, 2);
      fs.writeFileSync(vscodeSettingsPath, content, 'utf8');
    }
  } catch (error) {
    console.error('Error writing .vscode/settings.json:', error);
    throw error;
  }
}

// Helper function to update tree view settings in .vscode/settings.json
export function updateTreeViewSettings(folders: TreeViewFolderEntry[]): void {
  try {
    const workspaceConfig = workspace.getConfiguration('codebook-md');
    const currentTreeView = workspaceConfig.get('treeView');
    const updatedTreeView = {
      ...(currentTreeView || {}),
      folders: folders
    };

    workspaceConfig.update('treeView', updatedTreeView, false).then(
      () => {
        console.log('Tree view settings updated successfully via VS Code API');
      },
      (apiError: Error) => {
        console.error('Error updating via VS Code API, falling back to file method:', apiError);
        const settings = readVSCodeSettings();

        if (!settings['codebook-md']) {
          settings['codebook-md'] = {};
        }

        const codebookSettings = settings['codebook-md'] as {
          treeView?: {
            folders: TreeViewFolderEntry[];
            [key: string]: unknown;
          };
          [key: string]: unknown;
        };

        if (!codebookSettings.treeView) {
          codebookSettings.treeView = { folders: [] };
        } else {
          codebookSettings.treeView = {
            ...codebookSettings.treeView,
            folders: folders
          };
        }

        writeVSCodeSettings(settings);
      }
    );
  } catch (error) {
    console.error('Failed to update tree view settings:', error);
    window.showErrorMessage(`Failed to update tree view settings: ${(error as Error).message}`);
  }
}
