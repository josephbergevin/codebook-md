import * as fs from 'fs';
import { window } from 'vscode';
import { comparablePath } from './notebooksViewHtml';

/**
 * activeFilePath returns the file open in the editor: the active notebook's
 * file, or else the active text editor's. A notebook can be the open file
 * without any text editor being active.
 * @returns undefined when nothing is open, or what is open is not a file
 */
export function activeFilePath(): string | undefined {
  const uri = window.activeNotebookEditor?.notebook.uri ?? window.activeTextEditor?.document.uri;
  if (!uri || (uri.scheme !== 'file' && uri.scheme !== 'vscode-notebook-cell')) {
    return undefined;
  }
  return uri.fsPath;
}

/**
 * activeFilePaths returns the open file's paths in the form rows are matched
 * by: as opened, and with symlinks resolved, so that opening CLAUDE.md marks
 * the AGENTS.md row it links to.
 */
export function activeFilePaths(): string[] {
  const filePath = activeFilePath();
  if (!filePath) {
    return [];
  }
  const paths = [comparablePath(filePath)];
  try {
    const real = comparablePath(fs.realpathSync(filePath));
    if (!paths.includes(real)) {
      paths.push(real);
    }
  } catch {
    // Not on disk yet: the path as opened is all there is
  }
  return paths;
}

/** samePaths reports whether two path lists are the same, in the same order. */
export function samePaths(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
