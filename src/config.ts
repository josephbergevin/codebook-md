import { window, workspace } from 'vscode';
import * as path from 'path';

const config = workspace.getConfiguration('codebook-md');

// basePath is the workspace root path
const rootPath = config.get('rootPath', '');

export interface CodebookMdConfig {
  rootPath: string;
  tempPath: string;
  permalinkPrefix: string;
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

  return {
    rootPath: rootPath,
    tempPath: fullTempPath(tempPath, currentFile, rootPath),
    permalinkPrefix: config.get('permalinkPrefix', ''),
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

export function fullTempPath(tempPath: string, currentFile: string, workspacePath: string): string {
  if (tempPath === '' && workspacePath !== '') {
    return workspacePath;
  } else if (tempPath.startsWith('./')) {
    const currentPath = path.dirname(currentFile ?? '');
    return path.join(currentPath, tempPath.slice(2));
  }

  return tempPath;
}
