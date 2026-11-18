import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDirEntriesAsync } from './dirEntries';
import { docIssues, duplicateSkillIssues, SkillIdentity } from './docHealth';
import { docDisplayName, docTooltip, getDocMeta } from './docMeta';
import { readScopePatterns, ruleBaseDir, scopeMatchesFile } from './docScope';
import {
  agentDocGroupNames, agentDocLocations, agentDocRoots, classifyDocPath, DocType, skillFileName, skillRoots,
} from './docTypes';
import { suggestedDisplayName } from './folders';
import { toPosix } from './glob';

/**
 * Finds every agent doc in a workspace folder for the AI Docs view: instruction
 * files at any depth, and the skills, rules, prompts, agent definitions and
 * reference docs kept in each tool's standard folders, wherever in the tree a
 * project has them.
 *
 * Unlike Related Docs, which looks around the open file, this looks at the
 * whole folder and groups what it finds by type.
 *
 * The walk does not block: on a folder of many repositories it took a few
 * hundred milliseconds when measured, too long to hold up the editor. It
 * waits on the disk between folders and pauses between docs instead.
 */

export type AiDocGroupKey = 'instructions' | 'rule' | 'skill' | 'prompt' | 'agent' | 'reference';

/** Group titles, in the order the view shows them. */
export const aiDocGroups: { key: AiDocGroupKey; title: string; }[] = [
  { key: 'instructions', title: 'Instructions' },
  { key: 'rule', title: agentDocGroupNames.rule },
  { key: 'skill', title: agentDocGroupNames.skill },
  { key: 'prompt', title: agentDocGroupNames.prompt },
  { key: 'agent', title: agentDocGroupNames.agent },
  { key: 'reference', title: agentDocGroupNames.reference },
];

export interface AiDocRow {
  name: string;
  // Absolute path of the file the row opens
  filePath: string;
  // The path shown to the user: relative to its root, or `~/...` for user docs
  displayPath: string;
  docType: DocType;
  description?: string;
  // Short dimmed text after the name: the folder an instruction file is for
  hint?: string;
  tooltip: string;
  // A scoped rule's patterns, and the absolute folder they are relative to
  scope?: string[];
  scopeBase?: string;
  // An instruction file or unscoped rule applies to every file under this folder
  appliesUnder?: string;
  // A user-level doc applies whatever file is open
  appliesEverywhere?: boolean;
  issues: string[];
}

export interface AiDocGroup {
  key: AiDocGroupKey;
  title: string;
  rows: AiDocRow[];
}

export interface AiDocsRoot {
  name: string;
  dirPath: string;
  isUser: boolean;
  groups: AiDocGroup[];
  // The folder was too large to walk completely
  truncated: boolean;
}

export interface AiDocsRootSpec {
  name: string;
  dirPath: string;
  // The user's home folder: only the tools' own folders are read, never the whole tree
  isUser?: boolean;
}

export interface AiDocsOptions {
  exclusions: string[];
}

// Limits for walking a workspace folder
const maxWalkDepth = 8;
const maxWalkDirs = 5000;
const maxReferenceDocs = 200;

// How many docs are read and checked before giving other work a turn
const docsPerTurn = 20;

// Instruction files some tools keep in the home folder, outside any shared location
const userInstructionFiles: string[] = ['.codex/AGENTS.md', '.gemini/GEMINI.md'];

// A folder is only checked for agent docs when it holds one of these
const toolingDirs = new Set<string>(
  [...skillRoots, ...agentDocLocations.map(location => location.path), ...agentDocRoots].map(entry => entry.split('/')[0])
);

interface Found {
  filePath: string;
  realPath: string;
  isDirect: boolean;
  group: AiDocGroupKey;
  // The folder the doc belongs to: where its tool folder sits, or an instruction file's own folder
  baseDir: string;
  aliases: string[];
}

interface ScanState {
  root: AiDocsRootSpec;
  realRoot: string;
  options: AiDocsOptions;
  found: Map<string, Found>;
  dirsWalked: number;
  truncated: boolean;
}

async function realPathOf(target: string): Promise<string> {
  try {
    return await fs.promises.realpath(target);
  } catch {
    return target;
  }
}

function isSkillFile(fileName: string): boolean {
  return fileName.toLowerCase() === skillFileName.toLowerCase();
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Lets pending editor work run before the scan carries on. */
function nextTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/** addFound records a doc once, however many paths lead to it. */
async function addFound(state: ScanState, filePath: string, group: AiDocGroupKey, baseDir: string): Promise<void> {
  const realPath = await realPathOf(filePath);
  const isDirect = path.join(state.realRoot, path.relative(state.root.dirPath, filePath)) === realPath;
  const existing = state.found.get(realPath);
  if (!existing) {
    state.found.set(realPath, { filePath, realPath, isDirect, group, baseDir, aliases: [] });
    return;
  }
  if (existing.filePath === filePath || existing.aliases.includes(filePath)) {
    return;
  }
  if (!existing.isDirect && isDirect) {
    // First seen through a link: list the doc under its real path instead
    existing.aliases.push(existing.filePath);
    existing.filePath = filePath;
    existing.isDirect = true;
    existing.baseDir = baseDir;
  } else {
    existing.aliases.push(filePath);
  }
}

/** collectMarkdown lists the markdown files in a folder, and below it when asked. */
async function collectMarkdown(
  state: ScanState, dirPath: string, recursive: boolean, skipSkillFolders: boolean, out: string[], depth = 0
): Promise<void> {
  if (depth > maxWalkDepth || state.dirsWalked > maxWalkDirs) {
    state.truncated = true;
    return;
  }
  const entries = await readDirEntriesAsync(dirPath, state.options.exclusions);
  if (!entries) {
    return;
  }
  state.dirsWalked++;
  if (skipSkillFolders && depth > 0 && entries.files.some(isSkillFile)) {
    return;
  }
  entries.files.forEach(file => out.push(path.join(dirPath, file)));
  if (recursive) {
    for (const name of entries.dirs) {
      await collectMarkdown(state, path.join(dirPath, name), true, skipSkillFolders, out, depth + 1);
    }
  }
}

/** addToolDocs adds the agent docs kept in the tools' standard folders under one folder. */
async function addToolDocs(state: ScanState, baseDir: string, withReferences: boolean): Promise<void> {
  for (const root of skillRoots) {
    const rootPath = path.join(baseDir, root);
    const entries = await readDirEntriesAsync(rootPath, state.options.exclusions);
    if (!entries) {
      continue;
    }
    state.dirsWalked++;
    for (const name of entries.dirs) {
      const skillDir = path.join(rootPath, name);
      const skillFile = (await readDirEntriesAsync(skillDir, state.options.exclusions))?.files.find(isSkillFile);
      state.dirsWalked++;
      if (skillFile) {
        await addFound(state, path.join(skillDir, skillFile), 'skill', baseDir);
      }
    }
  }

  for (const location of agentDocLocations) {
    const locationPath = path.join(baseDir, location.path);
    if (!(await exists(locationPath))) {
      continue;
    }
    if (location.file) {
      await addFound(state, locationPath, 'instructions', baseDir);
      continue;
    }
    const files: string[] = [];
    await collectMarkdown(state, locationPath, location.recursive === true, false, files);
    for (const file of files) {
      if (!location.suffix || file.toLowerCase().endsWith(location.suffix)) {
        await addFound(state, file, location.type as AiDocGroupKey, baseDir);
      }
    }
  }

  if (!withReferences) {
    return;
  }
  for (const root of agentDocRoots) {
    const rootPath = path.join(baseDir, root);
    if (!(await exists(rootPath))) {
      continue;
    }
    const files: string[] = [];
    await collectMarkdown(state, rootPath, true, true, files);
    let added = 0;
    for (const file of files) {
      if (added >= maxReferenceDocs) {
        break;
      }
      // Whatever a location above has already claimed is not a reference
      if (!isSkillFile(path.basename(file)) && !state.found.has(await realPathOf(file))) {
        await addFound(state, file, 'reference', baseDir);
        added++;
      }
    }
  }
}

/** walk looks through a workspace folder for instruction files and tool folders. */
async function walk(state: ScanState, dirPath: string, depth: number): Promise<void> {
  const entries = await readDirEntriesAsync(dirPath, state.options.exclusions);
  if (!entries) {
    return;
  }
  state.dirsWalked++;

  for (const file of entries.files) {
    if (classifyDocPath(path.join(dirPath, file)) === 'instructions') {
      await addFound(state, path.join(dirPath, file), 'instructions', dirPath);
    }
  }

  if (entries.dirs.some(name => toolingDirs.has(name))) {
    await addToolDocs(state, dirPath, true);
  }

  for (const name of entries.dirs) {
    if (name.startsWith('.')) {
      continue; // tool folders are read above; other hidden folders hold no agent docs
    }
    if (depth + 1 > maxWalkDepth || state.dirsWalked > maxWalkDirs) {
      state.truncated = true;
      return;
    }
    await walk(state, path.join(dirPath, name), depth + 1);
  }
}

function isInside(folder: string, target: string): boolean {
  const relative = path.relative(folder, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function buildRows(state: ScanState): Promise<Map<AiDocGroupKey, AiDocRow[]>> {
  const root = state.root;
  const display = (target: string): string => {
    const relative = toPosix(path.relative(root.dirPath, target));
    return root.isUser ? `~/${relative}` : relative;
  };
  const folderText = (dir: string): string => {
    const relative = toPosix(path.relative(root.dirPath, dir));
    if (!relative) {
      return root.isUser ? '~' : 'workspace root';
    }
    return root.isUser ? `~/${relative}` : relative;
  };

  // Copies of a skill are told apart by the skills folder each one is in
  const skills: SkillIdentity[] = [];
  for (const found of state.found.values()) {
    if (found.group === 'skill') {
      const meta = getDocMeta(found.filePath);
      const name = meta.name || path.basename(path.dirname(found.filePath));
      skills.push({ filePath: found.filePath, realPath: found.realPath, name });
    }
  }
  const skillsFolder = (filePath: string): string => display(path.dirname(path.dirname(filePath)));
  const duplicates = duplicateSkillIssues(skills, skillsFolder);

  const rows = new Map<AiDocGroupKey, AiDocRow[]>();
  let read = 0;
  for (const found of state.found.values()) {
    // Reading a doc and checking its links and scope touch the disk directly,
    // so step aside every so often
    if (++read % docsPerTurn === 0) {
      await nextTurn();
    }
    const meta = getDocMeta(found.filePath);
    const displayPath = display(found.filePath);
    const issues = docIssues(found.filePath, meta);
    const duplicate = duplicates.get(found.filePath);
    if (duplicate) {
      issues.push(duplicate);
    }

    const row: AiDocRow = {
      name: docDisplayName(found.filePath, meta, suggestedDisplayName(path.basename(found.filePath))),
      filePath: found.filePath,
      displayPath,
      docType: meta.type,
      description: meta.description,
      tooltip: '',
      issues,
    };

    if (found.group === 'instructions') {
      // Several files share a name, so each says which folder it is for
      row.hint = folderText(found.baseDir);
      if (root.isUser) {
        row.appliesEverywhere = true;
      } else {
        row.appliesUnder = found.baseDir;
      }
    } else if (found.group === 'rule') {
      const patterns = readScopePatterns(meta.fields);
      const baseDir = ruleBaseDir(found.filePath) ?? found.baseDir;
      if (patterns.length > 0) {
        row.scope = patterns;
        row.scopeBase = baseDir;
      } else if (root.isUser) {
        row.appliesEverywhere = true;
      } else {
        row.appliesUnder = baseDir;
      }
    }

    if (duplicate) {
      row.hint = skillsFolder(found.filePath);
    } else if (!row.hint && !root.isUser && found.baseDir !== root.dirPath) {
      // A doc from a nested project says which one
      row.hint = folderText(found.baseDir);
    }

    row.tooltip = docTooltip(meta, displayPath, { aliases: found.aliases.map(display), scope: row.scope, issues });
    const list = rows.get(found.group) ?? [];
    list.push(row);
    rows.set(found.group, list);
  }
  return rows;
}

function sortRows(key: AiDocGroupKey, rows: AiDocRow[]): AiDocRow[] {
  const byText = (a: string, b: string): number => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);
  if (key === 'instructions') {
    // The workspace's own files first, then deeper folders in path order
    const depth = (row: AiDocRow): number => path.dirname(row.displayPath).split('/').filter(part => part !== '.').length;
    return rows.sort((a, b) => depth(a) - depth(b) || byText(a.displayPath, b.displayPath));
  }
  return rows.sort((a, b) => byText(a.name, b.name) || byText(a.displayPath, b.displayPath));
}

async function scanRoot(root: AiDocsRootSpec, options: AiDocsOptions): Promise<AiDocsRoot> {
  const state: ScanState = {
    root,
    realRoot: await realPathOf(root.dirPath),
    options,
    found: new Map<string, Found>(),
    dirsWalked: 0,
    truncated: false,
  };

  if (root.isUser) {
    await addToolDocs(state, root.dirPath, false);
    for (const relative of userInstructionFiles) {
      const file = path.join(root.dirPath, relative);
      if (await exists(file)) {
        await addFound(state, file, 'instructions', path.dirname(file));
      }
    }
  } else {
    await walk(state, root.dirPath, 0);
  }

  const rows = await buildRows(state);
  const groups: AiDocGroup[] = [];
  for (const group of aiDocGroups) {
    const list = rows.get(group.key);
    if (list && list.length > 0) {
      groups.push({ key: group.key, title: group.title, rows: sortRows(group.key, list) });
    }
  }
  return { name: root.name, dirPath: root.dirPath, isUser: root.isUser === true, groups, truncated: state.truncated };
}

/**
 * scanAiDocs finds the agent docs under each root.
 * @returns one entry per root, in the order given; a root with no agent docs has no groups
 */
export async function scanAiDocs(roots: AiDocsRootSpec[], options: AiDocsOptions): Promise<AiDocsRoot[]> {
  const results: AiDocsRoot[] = [];
  for (const root of roots) {
    try {
      results.push(await scanRoot(root, options));
    } catch (error) {
      console.error(`Could not scan ${root.dirPath} for agent docs:`, error);
      results.push({ name: root.name, dirPath: root.dirPath, isUser: root.isUser === true, groups: [], truncated: false });
    }
  }
  return results;
}

/** countAiDocs counts the docs found across roots. */
export function countAiDocs(roots: AiDocsRoot[]): number {
  return roots.reduce((total, root) => total + root.groups.reduce((sum, group) => sum + group.rows.length, 0), 0);
}

/** userDocsRoot describes the user's home folder as a root, for docs that apply to every project. */
export function userDocsRoot(): AiDocsRootSpec {
  return { name: 'User', dirPath: os.homedir(), isUser: true };
}

/**
 * rowAppliesTo reports whether a doc is one an agent would load for a file:
 * an instruction file in the file's folder or above it, a scoped rule whose
 * pattern matches the file, an unscoped rule for the project the file is in,
 * or a user-level instruction file or rule.
 */
export function rowAppliesTo(row: AiDocRow, filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  if (row.appliesEverywhere) {
    return true;
  }
  if (row.scope && row.scopeBase) {
    return scopeMatchesFile(row.scope, row.scopeBase, filePath);
  }
  return row.appliesUnder !== undefined && isInside(row.appliesUnder, filePath);
}
