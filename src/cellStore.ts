import { NotebookCellKind, workspace } from 'vscode';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_EXEC_PATH } from './config';
import { writeDirAndFileSyncSafe } from './io';
import { ExecutionHistoryEntry } from './types/executionHistory';

/**
 * Per-cell configuration and execution history, stored next to the notebook in
 * `<notebook>.md.config.json` without adding anything to the markdown.
 *
 * Each configured cell gets a stable ID. While a notebook is open, the ID is
 * tied to the cell's document URI, which survives moves, inserts and deletes.
 * Across sessions - and after edits outside the notebook, such as in the text
 * editor or through git - entries are re-attached to cells by a fingerprint of
 * the cell's language and code, falling back to its position.
 */

export interface CellConfig {
  output?: Record<string, boolean | string>;
  executionHistory?: ExecutionHistoryEntry[];
  [key: string]: unknown;
}

export interface CellEntry {
  // Position and fingerprint of the cell when the notebook was last saved
  index: number;
  fingerprint?: string;
  // Which of the cells with this fingerprint it was (0 = first), to tell
  // identical cells apart
  occurrence?: number;
  config: CellConfig;
  // Set when no cell in the notebook matches this entry. It is kept, not
  // deleted, so it re-attaches if the matching cell comes back.
  unmatched?: boolean;
}

export interface ConfigFile {
  version: 2;
  cells: Record<string, CellEntry>;
}

// The parts of the VS Code notebook API the store uses - kept structural so
// the store can be tested without VS Code
export interface StoreCell {
  index: number;
  kind: NotebookCellKind;
  document: { uri: { toString(): string; }; languageId: string; getText(): string; version?: number; };
  notebook: StoreNotebook;
}

export interface StoreNotebook {
  uri: { toString(): string; fsPath: string; };
  getCells?(): StoreCell[];
}

// --- the config file ----------------------------------------------------------

/**
 * getNotebookConfigPath returns where a notebook's config file lives: next to the
 * notebook, or in the directory set by codebook-md.notebookConfigPath.
 */
export function getNotebookConfigPath(notebookUri: { fsPath: string; }): string {
  const config = workspace.getConfiguration('codebook-md');
  let configDir = config.get<string>('notebookConfigPath');
  if (!configDir) {
    configDir = config.get<string>('execPath', DEFAULT_EXEC_PATH);
  }
  const notebookPath = notebookUri.fsPath;
  const resolvedDir = path.isAbsolute(configDir)
    ? configDir
    : path.resolve(path.dirname(notebookPath), configDir);
  return path.join(resolvedDir, `${path.basename(notebookPath)}.config.json`);
}

/**
 * migrateConfigFile converts the original format - entries keyed by cell index -
 * to version 2. Migrated entries get a deterministic ID so that repeated reads
 * agree before the file is rewritten, and no fingerprint, so they attach by
 * position the first time.
 */
export function migrateConfigFile(raw: unknown): ConfigFile {
  if (raw && typeof raw === 'object' && (raw as ConfigFile).version === 2 && (raw as ConfigFile).cells) {
    return raw as ConfigFile;
  }
  const file: ConfigFile = { version: 2, cells: {} };
  if (!raw || typeof raw !== 'object') {
    return file;
  }
  for (const [key, value] of Object.entries(raw as Record<string, { config?: CellConfig; }>)) {
    const index = Number(key);
    if (!Number.isInteger(index) || !value || typeof value !== 'object') {
      continue;
    }
    file.cells[`legacy-${index}`] = { index, config: value.config ?? {} };
  }
  return file;
}

export function readConfigFile(notebookUri: { fsPath: string; }): ConfigFile {
  const configPath = getNotebookConfigPath(notebookUri);
  try {
    if (fs.existsSync(configPath)) {
      return migrateConfigFile(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    }
  } catch (error) {
    console.error(`Error loading notebook config from ${configPath}:`, error);
  }
  return { version: 2, cells: {} };
}

export function writeConfigFile(notebookUri: { fsPath: string; }, file: ConfigFile): boolean {
  try {
    const configPath = getNotebookConfigPath(notebookUri);
    writeDirAndFileSyncSafe(path.dirname(configPath), configPath, JSON.stringify(file, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving notebook config:', error);
    return false;
  }
}

// --- cell identity --------------------------------------------------------------

/**
 * fingerprint identifies a cell by its language and code, ignoring line-ending
 * and trailing-whitespace differences.
 */
export function fingerprint(languageId: string, code: string): string {
  const normalized = code.replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
  return `${languageId}:${createHash('sha1').update(normalized).digest('hex').slice(0, 12)}`;
}

function fingerprintLanguage(value: string | undefined): string | undefined {
  return value?.slice(0, value.lastIndexOf(':'));
}

interface NotebookState {
  // cell document URI -> entry ID, for the cells matched so far
  claims: Map<string, string>;
  // IDs whose cell was removed from the notebook; pruned when the notebook is saved
  released: Set<string>;
  // cached fingerprints by cell document URI
  fingerprints: Map<string, { version: number | undefined; value: string; }>;
}

const states = new Map<string, NotebookState>();

function stateFor(notebook: StoreNotebook): NotebookState {
  const key = notebook.uri.toString();
  let state = states.get(key);
  if (!state) {
    state = { claims: new Map(), released: new Set(), fingerprints: new Map() };
    states.set(key, state);
  }
  return state;
}

function cellKey(cell: StoreCell): string {
  return cell.document.uri.toString();
}

function cellFingerprint(state: NotebookState, cell: StoreCell): string {
  const key = cellKey(cell);
  const cached = state.fingerprints.get(key);
  if (cached && cached.version !== undefined && cached.version === cell.document.version) {
    return cached.value;
  }
  const value = fingerprint(cell.document.languageId, cell.document.getText());
  state.fingerprints.set(key, { version: cell.document.version, value });
  return value;
}

// occurrenceOf returns which of the notebook's cells with the same fingerprint a cell is
function occurrenceOf(state: NotebookState, cell: StoreCell): number | undefined {
  const cells = typeof cell.notebook.getCells === 'function' ? cell.notebook.getCells() : undefined;
  if (!cells) {
    return undefined;
  }
  const own = cellFingerprint(state, cell);
  return cells.filter(c => c.kind === NotebookCellKind.Code && c.index < cell.index && cellFingerprint(state, c) === own).length;
}

/**
 * reconcile matches the file's entries to the notebook's cells, keeping the
 * matches already made while the notebook has been open. Entries are matched
 * by fingerprint first (the nearest cell with the same language and code), then
 * by position (a cell of the same language where the entry's cell used to be).
 */
export function reconcile(notebook: StoreNotebook, file: ConfigFile): void {
  const state = stateFor(notebook);
  const cells = typeof notebook.getCells === 'function' ? notebook.getCells() : undefined;
  if (!cells) {
    return;
  }

  // Release matches whose cell is gone, or whose entry was removed from the file
  const live = new Set(cells.map(cellKey));
  for (const [key, id] of [...state.claims]) {
    if (!live.has(key)) {
      state.claims.delete(key);
      state.released.add(id);
    } else if (!file.cells[id]) {
      state.claims.delete(key);
    }
  }

  const claimedIds = new Set(state.claims.values());
  const freeCells = cells.filter(cell => cell.kind === NotebookCellKind.Code && !state.claims.has(cellKey(cell)));
  const pending = Object.entries(file.cells)
    .filter(([id]) => !claimedIds.has(id))
    .sort(([, a], [, b]) => a.index - b.index);

  const claim = (cell: StoreCell, id: string): void => {
    state.claims.set(cellKey(cell), id);
    state.released.delete(id);
    freeCells.splice(freeCells.indexOf(cell), 1);
    claimedIds.add(id);
  };

  // Pass 1: same language and code. Among identical cells, prefer the one
  // that is the same occurrence (e.g. the second `ls` cell), then the nearest.
  for (const [id, entry] of pending) {
    if (!entry.fingerprint) {
      continue;
    }
    const identical = cells.filter(cell => cell.kind === NotebookCellKind.Code && cellFingerprint(state, cell) === entry.fingerprint);
    const matches = identical.filter(cell => freeCells.includes(cell));
    if (matches.length > 0) {
      const rank = (cell: StoreCell): [number, number] => [
        identical.indexOf(cell) === entry.occurrence ? 0 : 1,
        Math.abs(cell.index - entry.index),
      ];
      matches.sort((a, b) => {
        const [ra, rb] = [rank(a), rank(b)];
        return ra[0] - rb[0] || ra[1] - rb[1];
      });
      claim(matches[0], id);
    }
  }

  // Pass 2: a cell of the same language still at the entry's position - the
  // cell's code was edited outside the notebook. Legacy entries have no
  // fingerprint and attach by position alone.
  for (const [id, entry] of pending) {
    if (claimedIds.has(id)) {
      continue;
    }
    const cell = freeCells.find(c => c.index === entry.index);
    const language = fingerprintLanguage(entry.fingerprint);
    if (cell && (language === undefined || cell.document.languageId === language)) {
      claim(cell, id);
    }
  }

  for (const [id, entry] of Object.entries(file.cells)) {
    if (claimedIds.has(id)) {
      delete entry.unmatched;
    } else {
      entry.unmatched = true;
    }
  }
}

/** entryIdFor returns the ID of the entry matched to a cell, if any. */
function entryIdFor(cell: StoreCell, file: ConfigFile): string | undefined {
  const state = stateFor(cell.notebook);
  reconcile(cell.notebook, file);
  const claimed = state.claims.get(cellKey(cell));
  if (claimed) {
    return claimed;
  }
  // Without the notebook's cell list (e.g. a detached cell object), fall back to position
  if (typeof cell.notebook.getCells !== 'function') {
    return Object.entries(file.cells).find(([, entry]) => entry.index === cell.index)?.[0];
  }
  return undefined;
}

// --- reading and writing a cell's config ------------------------------------------

/** readCellConfig returns a cell's stored config, or null if it has none. */
export function readCellConfig(cell: StoreCell): CellConfig | null {
  if (!cell.notebook) {
    return null;
  }
  const file = readConfigFile(cell.notebook.uri);
  const id = entryIdFor(cell, file);
  return id ? file.cells[id].config : null;
}

/**
 * updateCellConfig changes a cell's stored config. The update receives the
 * current config (empty for a cell with none) and returns the new one; an empty
 * result removes the cell's entry.
 */
export function updateCellConfig(cell: StoreCell, update: (config: CellConfig) => CellConfig): boolean {
  if (!cell.notebook) {
    return false;
  }
  const file = readConfigFile(cell.notebook.uri);
  let id = entryIdFor(cell, file);
  const config = update(id ? file.cells[id].config : {});
  const isEmpty = Object.keys(config).length === 0;

  if (!id) {
    if (isEmpty) {
      return true; // nothing stored, nothing to store
    }
    id = `c-${randomBytes(4).toString('hex')}`;
    const state = stateFor(cell.notebook);
    file.cells[id] = { index: cell.index, fingerprint: cellFingerprint(state, cell), occurrence: occurrenceOf(state, cell), config };
    if (typeof cell.notebook.getCells === 'function') {
      state.claims.set(cellKey(cell), id);
    }
  } else if (isEmpty) {
    delete file.cells[id];
  } else {
    file.cells[id].config = config;
  }
  return writeConfigFile(cell.notebook.uri, file);
}

// --- notebook lifecycle -----------------------------------------------------------

/**
 * onNotebookSaved records each matched cell's position and fingerprint as saved
 * to disk - so entries can be re-attached after the markdown is edited outside
 * the notebook - and drops the entries of cells that were deleted.
 */
export function onNotebookSaved(notebook: StoreNotebook): void {
  if (!states.has(notebook.uri.toString()) && !fs.existsSync(getNotebookConfigPath(notebook.uri))) {
    return; // nothing configured for this notebook
  }
  const file = readConfigFile(notebook.uri);
  if (Object.keys(file.cells).length === 0) {
    return;
  }
  const before = JSON.stringify(file);
  reconcile(notebook, file);

  const state = stateFor(notebook);
  const cells = typeof notebook.getCells === 'function' ? notebook.getCells() : [];
  for (const cell of cells) {
    const id = state.claims.get(cellKey(cell));
    if (id && file.cells[id]) {
      file.cells[id].index = cell.index;
      file.cells[id].fingerprint = cellFingerprint(state, cell);
      file.cells[id].occurrence = occurrenceOf(state, cell);
    }
  }
  for (const id of state.released) {
    delete file.cells[id];
  }
  state.released.clear();

  if (JSON.stringify(file) !== before) {
    writeConfigFile(notebook.uri, file);
  }
}

/** forgetNotebook drops what is held in memory for a closed notebook. */
export function forgetNotebook(notebook: StoreNotebook): void {
  states.delete(notebook.uri.toString());
}

// For tests
export const __test__ = {
  resetState: (): void => states.clear(),
};
