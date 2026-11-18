import * as fs from 'fs';
import * as path from 'path';
import { isMarkdownFileName } from './docTypes';

/**
 * Reading one folder for the side bar's scanners: which markdown files, other
 * files and sub-folders it holds, with exclusions applied and symlinks
 * followed.
 */

// Never walked, whatever the exclusions say
export const alwaysSkippedDirs = new Set<string>(['node_modules', '.git']);

/** isExcluded matches a file or folder name against the exclusion list (`*` is a wildcard). */
export function isExcluded(name: string, exclusions: string[]): boolean {
  if (!exclusions || exclusions.length === 0) {
    return false;
  }
  return exclusions.some(exclusion => {
    const pattern = exclusion.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(name);
  });
}

export interface DirEntries {
  // Markdown files
  files: string[];
  // Every other file, hidden ones left out
  others: string[];
  dirs: string[];
}

const byName = (a: string, b: string): number => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);

/** addEntry files one directory entry under the list it belongs to. */
function addEntry(result: DirEntries, name: string, isDir: boolean, isFile: boolean): void {
  if (isDir && !alwaysSkippedDirs.has(name)) {
    result.dirs.push(name);
  } else if (isFile && isMarkdownFileName(name)) {
    result.files.push(name);
  } else if (isFile && !name.startsWith('.')) {
    result.others.push(name);
  }
}

function sorted(result: DirEntries): DirEntries {
  result.files.sort(byName);
  result.others.sort(byName);
  result.dirs.sort(byName);
  return result;
}

/**
 * readDirEntries reads a folder once and returns its entries in name order.
 * A symlink counts as what it points to; a dangling one is left out.
 * @returns undefined when the folder cannot be read
 */
export function readDirEntries(dirPath: string, exclusions: string[]): DirEntries | undefined {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const result: DirEntries = { files: [], others: [], dirs: [] };
  for (const entry of entries) {
    if (isExcluded(entry.name, exclusions)) {
      continue;
    }
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const stats = fs.statSync(path.join(dirPath, entry.name));
        isDir = stats.isDirectory();
        isFile = stats.isFile();
      } catch {
        continue; // a dangling link
      }
    }
    addEntry(result, entry.name, isDir, isFile);
  }
  return sorted(result);
}

/**
 * readDirEntriesAsync is readDirEntries without blocking: for scans that walk
 * a whole workspace, where waiting on the disk must not hold up the editor.
 * @returns undefined when the folder cannot be read
 */
export async function readDirEntriesAsync(dirPath: string, exclusions: string[]): Promise<DirEntries | undefined> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const result: DirEntries = { files: [], others: [], dirs: [] };
  for (const entry of entries) {
    if (isExcluded(entry.name, exclusions)) {
      continue;
    }
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const stats = await fs.promises.stat(path.join(dirPath, entry.name));
        isDir = stats.isDirectory();
        isFile = stats.isFile();
      } catch {
        continue; // a dangling link
      }
    }
    addEntry(result, entry.name, isDir, isFile);
  }
  return sorted(result);
}
