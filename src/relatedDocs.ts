import * as fs from 'fs';
import * as path from 'path';
import * as config from './config';
import { docDisplayName, docTooltip, getDocMeta } from './docMeta';
import {
  agentDocGroupNames, agentDocLocations, agentDocRoots, isMarkdownFileName, skillFileName, skillRoots,
} from './docTypes';
import { FolderGroup, FolderGroupFile, FolderGroupFolder, suggestedDisplayName } from './folders';
import { globLiteralPrefix, globToRegExp, isGlobPattern, toPosix } from './glob';

/**
 * Builds the dynamic folder group ("Related Docs"): the markdown files that
 * sit around the file being edited.
 *
 * Every folder from the open file's own up to the workspace root becomes a
 * top-level folder in the group. Each one holds:
 * - the markdown files directly in it,
 * - the sub-folders named in `subFolderInclusions` (a plain name is matched at
 *   every level; an entry with a `/` or a wildcard is a pattern, relative to
 *   that folder),
 * - the agent docs found in the standard locations under it: skills, rules,
 *   prompts, agent definitions and reference docs, each in a folder of its own.
 */

// Never walked, whatever the exclusions say
const alwaysSkipped = new Set(['node_modules', '.git']);
// Limits for the open-ended walks (patterns, skill folders, agent doc roots)
const maxWalkDepth = 6;
const maxWalkDirs = 2000;
const maxReferenceDocs = 200;
// The most non-markdown files listed under one skill
const maxSkillFiles = 50;
const maxCachedScans = 50;

type GroupKey = keyof typeof agentDocGroupNames;
const groupOrder: GroupKey[] = ['skill', 'rule', 'prompt', 'agent', 'reference'];

/** One row waiting for its label: a file, plus the other paths that lead to it. */
interface PlacedDoc {
  absPath: string;
  realPath: string;
  // False when the path reaches the file through a symlink
  isDirect: boolean;
  aliases: string[];
  // The row is either a file or, for a skill with supporting files, a folder
  file?: FolderGroupFile;
  node?: DirNode;
}

interface DirNode {
  name: string;
  files: FolderGroupFile[];
  // Keyed by absolute path, or by `#group` for the agent doc groups
  children: Map<string, DirNode>;
  // An agent doc group rather than a folder on disk
  isGroup: boolean;
  // Set when the folder stands for a file: a skill with supporting files
  doc?: PlacedDoc;
}

interface TopFolder {
  dirPath: string;
  // dirPath with symlinks resolved, to tell direct paths from linked ones
  realDirPath: string;
  root: DirNode;
  // Every file shown under this folder, by real path, so none appears twice
  placed: Map<string, PlacedDoc>;
  hasDirectMarkdown: boolean;
}

interface Scan {
  workspacePath: string;
  settings: config.DynamicFolderGroupConfig;
  plainInclusions: Set<string>;
  patternInclusions: string[];
  // Every folder looked at, with its modified time (0 when it did not exist)
  watched: Map<string, number>;
  dirsWalked: number;
}

interface CachedScan {
  group: FolderGroup | undefined;
  watched: Map<string, number>;
}

const scanCache = new Map<string, CachedScan>();

/** clearRelatedDocsCache drops every cached scan, so the next build reads the disk. */
export function clearRelatedDocsCache(): void {
  scanCache.clear();
}

function newNode(name: string, isGroup = false): DirNode {
  return { name, files: [], children: new Map<string, DirNode>(), isGroup };
}

function modifiedTime(dirPath: string): number {
  try {
    return fs.statSync(dirPath).mtimeMs;
  } catch {
    return 0;
  }
}

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

interface DirEntries {
  // Markdown files
  files: string[];
  // Every other file, hidden ones left out
  others: string[];
  dirs: string[];
}

/**
 * listDir reads a folder once, following symlinks, and returns its markdown
 * files, its other files and its sub-folders in name order with exclusions
 * already applied.
 */
function listDir(scan: Scan, dirPath: string): DirEntries {
  const result: DirEntries = { files: [], others: [], dirs: [] };
  scan.watched.set(dirPath, modifiedTime(dirPath));
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return result;
  }
  scan.dirsWalked++;

  for (const entry of entries) {
    if (isExcluded(entry.name, scan.settings.exclusions)) {
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
    if (isDir && !alwaysSkipped.has(entry.name)) {
      result.dirs.push(entry.name);
    } else if (isFile && isMarkdownFileName(entry.name)) {
      result.files.push(entry.name);
    } else if (isFile && !entry.name.startsWith('.')) {
      result.others.push(entry.name);
    }
  }

  const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);
  result.files.sort(byName);
  result.others.sort(byName);
  result.dirs.sort(byName);
  return result;
}

function realPathOf(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/**
 * placeFile adds a file's row under a node, unless the same file is already
 * shown under this top-level folder. A second path to a file already shown is
 * remembered as an alias; when the first path was the symlink, the row moves
 * to the real file's name.
 * @returns the placed doc when a new row was added
 */
function placeFile(top: TopFolder, node: DirNode, absPath: string): PlacedDoc | undefined {
  const realPath = realPathOf(absPath);
  // The workspace itself may be opened through a link, so compare below the top folder
  const isDirect = path.join(top.realDirPath, path.relative(top.dirPath, absPath)) === realPath;
  const existing = top.placed.get(realPath);
  if (existing) {
    if (existing.absPath === absPath || existing.aliases.includes(absPath)) {
      return undefined;
    }
    if (!existing.isDirect && isDirect) {
      existing.aliases.push(existing.absPath);
      existing.absPath = absPath;
      existing.isDirect = true;
    } else {
      existing.aliases.push(absPath);
    }
    return undefined;
  }

  const doc: PlacedDoc = { absPath, realPath, isDirect, aliases: [], file: new FolderGroupFile('', '') };
  node.files.push(doc.file as FolderGroupFile);
  top.placed.set(realPath, doc);
  return doc;
}

function childNode(parent: DirNode, key: string, name: string, isGroup = false): DirNode {
  let child = parent.children.get(key);
  if (!child) {
    child = newNode(name, isGroup);
    parent.children.set(key, child);
  }
  return child;
}

function groupNode(top: TopFolder, key: GroupKey): DirNode {
  return childNode(top.root, `#${key}`, agentDocGroupNames[key], true);
}

/** nodeForDir returns the node for a folder below the top folder, creating the ones in between. */
function nodeForDir(top: TopFolder, dirPath: string): DirNode {
  let node = top.root;
  let current = top.dirPath;
  for (const segment of toPosix(path.relative(top.dirPath, dirPath)).split('/').filter(Boolean)) {
    current = path.join(current, segment);
    node = childNode(node, current, suggestedDisplayName(segment));
  }
  return node;
}

/** addNamedSubFolders adds the sub-folders whose names are in the inclusion list, level by level. */
function addNamedSubFolders(scan: Scan, top: TopFolder, node: DirNode, dirPath: string, dirs: string[], depth: number): void {
  if (scan.plainInclusions.size === 0 || depth > maxWalkDepth) {
    return;
  }
  for (const name of dirs) {
    if (!scan.plainInclusions.has(name)) {
      continue;
    }
    const subPath = path.join(dirPath, name);
    const subNode = childNode(node, subPath, suggestedDisplayName(name));
    const entries = listDir(scan, subPath);
    entries.files.forEach(file => placeFile(top, subNode, path.join(subPath, file)));
    addNamedSubFolders(scan, top, subNode, subPath, entries.dirs, depth + 1);
  }
}

/**
 * addPatternFolders adds the folders matching one inclusion pattern, which is
 * read relative to the top folder: `tooling/**` is `tooling` and everything
 * below it.
 */
function addPatternFolders(scan: Scan, top: TopFolder, pattern: string): void {
  let matcher: RegExp;
  try {
    matcher = globToRegExp(pattern);
  } catch (error) {
    console.log(`Ignoring invalid sub-folder inclusion "${pattern}":`, error);
    return;
  }
  const hasWildcard = /[*?[\]{}]/.test(pattern);
  const startDir = path.join(top.dirPath, globLiteralPrefix(pattern));
  if (startDir === top.dirPath && !hasWildcard) {
    return;
  }

  const walk = (dirPath: string, depth: number): void => {
    if (depth > maxWalkDepth || scan.dirsWalked > maxWalkDirs) {
      return;
    }
    const entries = listDir(scan, dirPath);
    const relative = toPosix(path.relative(top.dirPath, dirPath));
    if (relative && matcher.test(relative)) {
      const node = nodeForDir(top, dirPath);
      entries.files.forEach(file => placeFile(top, node, path.join(dirPath, file)));
    }
    if (hasWildcard) {
      entries.dirs.forEach(name => walk(path.join(dirPath, name), depth + 1));
    }
  };

  if (modifiedTime(startDir) === 0) {
    scan.watched.set(startDir, 0);
    return;
  }
  walk(startDir, 0);
}

/**
 * collectMarkdown lists the markdown files under a folder, to a limited depth.
 * When `others` is given it also receives the files that are not markdown.
 */
function collectMarkdown(
  scan: Scan, dirPath: string, recursive: boolean, skipSkillFolders: boolean, out: string[], depth = 0, others?: string[]
): void {
  if (depth > maxWalkDepth || scan.dirsWalked > maxWalkDirs) {
    return;
  }
  const entries = listDir(scan, dirPath);
  if (skipSkillFolders && depth > 0 && entries.files.some(isSkillFile)) {
    return; // a skill's own files are listed with the skill
  }
  entries.files.forEach(file => out.push(path.join(dirPath, file)));
  if (others) {
    entries.others.forEach(file => others.push(path.join(dirPath, file)));
  }
  if (recursive) {
    entries.dirs.forEach(name => collectMarkdown(scan, path.join(dirPath, name), true, skipSkillFolders, out, depth + 1, others));
  }
}

function isSkillFile(fileName: string): boolean {
  return fileName.toLowerCase() === skillFileName.toLowerCase();
}

/**
 * addSkill adds one skill. It is a single row, unless its folder holds other
 * files - more markdown, scripts, templates: then it is a folder that opens
 * SKILL.md and lists them.
 */
function addSkill(scan: Scan, top: TopFolder, skillDir: string, skillFile: string): void {
  const skillPath = path.join(skillDir, skillFile);
  const skills = groupNode(top, 'skill');

  const supporting: string[] = [];
  const bundled: string[] = [];
  collectMarkdown(scan, skillDir, true, false, supporting, 0, bundled);
  const others = supporting.filter(file => file !== skillPath);

  const doc = placeFile(top, skills, skillPath);
  if (!doc || (others.length === 0 && bundled.length === 0)) {
    return;
  }

  // Swap the file row for a folder row that stands for the same file
  skills.files = skills.files.filter(file => file !== doc.file);
  const node = childNode(skills, skillDir, '');
  doc.file = undefined;
  doc.node = node;
  node.doc = doc;
  others.forEach(file => placeFile(top, node, file));

  // Files that are not markdown keep their path inside the skill as a name,
  // so `scripts/run.sh` reads as what it is
  bundled.slice(0, maxSkillFiles).forEach(file => {
    const relativePath = toPosix(path.relative(scan.workspacePath, file));
    const row = new FolderGroupFile(toPosix(path.relative(skillDir, file)), relativePath);
    row.tooltip = relativePath;
    node.files.push(row);
  });
}

/** addAgentDocs adds the agent docs kept in the standard locations under the top folder. */
function addAgentDocs(scan: Scan, top: TopFolder): void {
  for (const root of skillRoots) {
    const rootPath = path.join(top.dirPath, root);
    if (modifiedTime(rootPath) === 0) {
      scan.watched.set(rootPath, 0);
      continue;
    }
    for (const name of listDir(scan, rootPath).dirs) {
      const skillDir = path.join(rootPath, name);
      const skillFile = listDir(scan, skillDir).files.find(isSkillFile);
      if (skillFile) {
        addSkill(scan, top, skillDir, skillFile);
      }
    }
  }

  for (const location of agentDocLocations) {
    const locationPath = path.join(top.dirPath, location.path);
    if (modifiedTime(locationPath) === 0) {
      scan.watched.set(locationPath, 0);
      continue;
    }
    if (location.file) {
      // Single instruction files sit next to the folder's own markdown files
      placeFile(top, top.root, locationPath);
      continue;
    }
    const files: string[] = [];
    collectMarkdown(scan, locationPath, location.recursive === true, false, files);
    files
      .filter(file => !location.suffix || file.toLowerCase().endsWith(location.suffix))
      .forEach(file => placeFile(top, groupNode(top, location.type as GroupKey), file));
  }

  for (const root of agentDocRoots) {
    const rootPath = path.join(top.dirPath, root);
    if (modifiedTime(rootPath) === 0) {
      scan.watched.set(rootPath, 0);
      continue;
    }
    const files: string[] = [];
    collectMarkdown(scan, rootPath, true, true, files);
    files
      .filter(file => !isSkillFile(path.basename(file)))
      .slice(0, maxReferenceDocs)
      .forEach(file => placeFile(top, groupNode(top, 'reference'), file));
  }
}

/** labelDoc fills in a row's label, type and hover text once every alias is known. */
function labelDoc(scan: Scan, doc: PlacedDoc): void {
  const relative = (target: string) => toPosix(path.relative(scan.workspacePath, target));
  const meta = getDocMeta(doc.absPath);
  const baseName = path.basename(doc.absPath);
  const name = docDisplayName(doc.absPath, meta, suggestedDisplayName(baseName));
  const tooltip = docTooltip(meta, relative(doc.absPath), doc.aliases.map(relative));

  // Name the other paths in the row itself when their file names differ
  const otherNames = Array.from(new Set(doc.aliases.map(alias => path.basename(alias)))).filter(alias => alias !== baseName);
  const hint = otherNames.length ? `also ${otherNames.join(', ')}` : undefined;

  if (doc.file) {
    doc.file.name = name;
    doc.file.path = relative(doc.absPath);
    doc.file.docType = meta.type;
    doc.file.tooltip = tooltip;
    doc.file.hint = hint;
  } else if (doc.node) {
    doc.node.name = name;
  }
}

function toFolder(scan: Scan, node: DirNode, entityId: string, isTop: boolean): FolderGroupFolder | undefined {
  const folder = new FolderGroupFolder(node.name, entityId);
  const fileIdPrefix = isTop ? entityId.replace(/-0$/, '') : entityId;
  node.files.forEach((file, index) => {
    file.entityId = `${fileIdPrefix}-${index + 1}`;
    folder.files.push(file);
  });

  // Agent doc groups first, in a fixed order, then folders in the order found
  const children = Array.from(node.children.entries());
  const groups = groupOrder
    .map(key => node.children.get(`#${key}`))
    .filter((child): child is DirNode => child !== undefined);
  const dirs = children.filter(([, child]) => !child.isGroup).map(([, child]) => child);
  for (const child of [...groups, ...dirs]) {
    const subFolder = toFolder(scan, child, `${entityId}.${folder.folders.length + 1}`, false);
    if (subFolder) {
      folder.folders.push(subFolder);
    }
  }

  if (node.doc) {
    const meta = getDocMeta(node.doc.absPath);
    const relativePath = toPosix(path.relative(scan.workspacePath, node.doc.absPath));
    folder.filePath = relativePath;
    folder.docType = meta.type;
    folder.tooltip = docTooltip(meta, relativePath, node.doc.aliases.map(alias => toPosix(path.relative(scan.workspacePath, alias))));
  }

  // A folder with nothing to show is left out
  if (folder.files.length === 0 && folder.folders.length === 0 && !folder.filePath) {
    return undefined;
  }
  return folder;
}

/** ancestorDirs lists the folders from the file's own up to the workspace root, nearest first. */
function ancestorDirs(filePath: string, workspacePath: string): string[] {
  const dirs: string[] = [];
  let current = path.dirname(filePath);
  const insideWorkspace = (dir: string) => {
    if (!workspacePath) {
      return true;
    }
    const relative = path.relative(workspacePath, dir);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };
  while (current && current !== path.dirname(current) && insideWorkspace(current)) {
    dirs.push(current);
    current = path.dirname(current);
  }
  return dirs;
}

function buildTopFolder(scan: Scan, dirPath: string): TopFolder {
  const top: TopFolder = {
    dirPath,
    realDirPath: realPathOf(dirPath),
    root: newNode(suggestedDisplayName(path.basename(dirPath))),
    placed: new Map<string, PlacedDoc>(),
    hasDirectMarkdown: false,
  };

  const entries = listDir(scan, dirPath);
  entries.files.forEach(file => placeFile(top, top.root, path.join(dirPath, file)));
  top.hasDirectMarkdown = top.root.files.length > 0;

  addNamedSubFolders(scan, top, top.root, dirPath, entries.dirs, 0);
  scan.patternInclusions.forEach(pattern => addPatternFolders(scan, top, pattern));

  // Agent docs are only looked for inside a workspace, so a loose file never
  // pulls in the agent setup of the folders above it
  if (scan.settings.includeAgentDocs && scan.workspacePath) {
    addAgentDocs(scan, top);
  }

  top.placed.forEach(doc => labelDoc(scan, doc));
  return top;
}

function scanRelatedDocs(filePath: string, scan: Scan): FolderGroup | undefined {
  const tops = ancestorDirs(filePath, scan.workspacePath).map(dir => buildTopFolder(scan, dir));

  // Folders with markdown of their own come first, as they always have
  const ordered = [...tops.filter(top => top.hasDirectMarkdown), ...tops.filter(top => !top.hasDirectMarkdown)];
  const folders: FolderGroupFolder[] = [];
  for (const top of ordered) {
    const folder = toFolder(scan, top.root, `dynamic-${folders.length + 1}-0`, true);
    if (folder) {
      folders.push(folder);
    }
  }
  if (folders.length === 0) {
    return undefined;
  }

  const group = new FolderGroup(scan.settings.name, '', scan.settings.description, folders);
  group.isDynamic = true;
  return group;
}

function workspacePathOrEmpty(): string {
  try {
    return config.getWorkspaceFolder() || '';
  } catch {
    return '';
  }
}

function cacheKeyFor(filePath: string, workspacePath: string, settings: config.DynamicFolderGroupConfig): string {
  return JSON.stringify([path.dirname(filePath), workspacePath, settings]);
}

function isStillValid(cached: CachedScan): boolean {
  for (const [dirPath, mtimeMs] of cached.watched) {
    if (modifiedTime(dirPath) !== mtimeMs) {
      return false;
    }
  }
  return true;
}

/**
 * createDynamicFolderGroupFromPath builds the dynamic folder group for the
 * file being edited.
 *
 * The result is cached per folder and reused while none of the folders it was
 * built from has changed. Edits inside a file do not change its folder, so
 * callers that watch for file changes call clearRelatedDocsCache.
 * @returns undefined when the group is turned off or has nothing to show
 */
export function createDynamicFolderGroupFromPath(filePath: string): FolderGroup | undefined {
  if (!filePath) {
    return undefined;
  }
  const settings = config.getDynamicFolderGroupConfig();
  if (!settings.enabled) {
    return undefined;
  }

  try {
    const workspacePath = workspacePathOrEmpty();
    const cacheKey = cacheKeyFor(filePath, workspacePath, settings);
    const cached = scanCache.get(cacheKey);
    if (cached && isStillValid(cached)) {
      return cached.group;
    }

    const inclusions = settings.subFolderInclusions ?? [];
    const scan: Scan = {
      workspacePath,
      settings,
      plainInclusions: new Set(inclusions.filter(entry => !isGlobPattern(entry))),
      patternInclusions: inclusions.filter(isGlobPattern),
      watched: new Map<string, number>(),
      dirsWalked: 0,
    };
    const group = scanRelatedDocs(filePath, scan);

    if (scanCache.size >= maxCachedScans) {
      scanCache.clear();
    }
    scanCache.set(cacheKey, { group, watched: scan.watched });
    return group;
  } catch (error) {
    console.error('Error creating dynamic folder group:', error);
    return undefined;
  }
}

/**
 * isRelatedDocsCurrent reports whether the group last built for a file still
 * matches the disk: none of the folders it was built from has been added,
 * removed or had an entry change. Callers use it to skip a redraw when a
 * file-system event did not touch anything the tree shows.
 * @returns true as well when the group is turned off, as there is nothing to redraw
 */
export function isRelatedDocsCurrent(filePath: string): boolean {
  if (!filePath) {
    return true;
  }
  try {
    const settings = config.getDynamicFolderGroupConfig();
    if (!settings.enabled) {
      return true;
    }
    const cached = scanCache.get(cacheKeyFor(filePath, workspacePathOrEmpty(), settings));
    return cached !== undefined && isStillValid(cached);
  } catch (error) {
    console.log('Could not check the dynamic folder group for changes:', error);
    return false;
  }
}
