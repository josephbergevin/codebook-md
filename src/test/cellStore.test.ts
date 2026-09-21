import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let mockConfigDir = '';

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: (key: string, fallback?: unknown) => (key === 'notebookConfigPath' ? mockConfigDir : fallback),
    })),
  },
  NotebookCellKind: { Markup: 1, Code: 2 },
}));

jest.mock('../io', () => ({
  writeDirAndFileSyncSafe: (dir: string, file: string, contents: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, contents);
  },
}));

import {
  __test__, fingerprint, forgetNotebook, getNotebookConfigPath, migrateConfigFile, onNotebookSaved,
  readCellConfig, readConfigFile, StoreCell, StoreNotebook, updateCellConfig,
} from '../cellStore';

const Markup = 1;
const Code = 2;

interface CellSpec { lang: string; code: string; }

// FakeNotebook mimics a notebook document: each cell has a document URI that
// stays with the cell while it moves, like VS Code's cell URIs
class FakeNotebook implements StoreNotebook {
  uri = { toString: () => 'file:///notes/demo.md', fsPath: '/notes/demo.md' };
  private cells: StoreCell[] = [];
  private nextHandle = 0;

  constructor(specs: CellSpec[]) {
    this.load(specs);
  }

  /** load replaces every cell with new ones - a reload or a new session */
  load(specs: CellSpec[]): void {
    this.cells = specs.map(spec => this.makeCell(spec));
    this.renumber();
  }

  getCells(): StoreCell[] {
    return this.cells;
  }

  cell(index: number): StoreCell {
    return this.cells[index];
  }

  insert(index: number, spec: CellSpec): void {
    this.cells.splice(index, 0, this.makeCell(spec));
    this.renumber();
  }

  move(from: number, to: number): void {
    const [cell] = this.cells.splice(from, 1);
    this.cells.splice(to, 0, cell);
    this.renumber();
  }

  remove(index: number): void {
    this.cells.splice(index, 1);
    this.renumber();
  }

  private makeCell(spec: CellSpec): StoreCell {
    const handle = this.nextHandle++;
    let code = spec.code;
    return {
      index: 0,
      kind: spec.lang === 'markdown' ? Markup : Code,
      notebook: this,
      document: {
        uri: { toString: () => `vscode-notebook-cell:/notes/demo.md#W${handle}` },
        languageId: spec.lang,
        getText: () => code,
        set text(value: string) { code = value; },
      } as StoreCell['document'],
    };
  }

  private renumber(): void {
    this.cells.forEach((cell, i) => { cell.index = i; });
  }
}

const md = (code: string): CellSpec => ({ lang: 'markdown', code });
const sh = (code: string): CellSpec => ({ lang: 'shellscript', code });
const py = (code: string): CellSpec => ({ lang: 'python', code });

// newSession simulates closing and reopening the notebook from disk
function newSession(notebook: FakeNotebook, specs: CellSpec[]): void {
  forgetNotebook(notebook);
  notebook.load(specs);
}

function setConfig(cell: StoreCell, config: Record<string, unknown>): void {
  expect(updateCellConfig(cell, () => config)).toBe(true);
}

function storedFile() {
  return JSON.parse(fs.readFileSync(getNotebookConfigPath({ fsPath: '/notes/demo.md' }), 'utf8'));
}

beforeEach(() => {
  mockConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cellstore-'));
  __test__.resetState();
});

afterEach(() => {
  fs.rmSync(mockConfigDir, { recursive: true, force: true });
});

describe('fingerprint', () => {
  it('ignores line endings and trailing whitespace, but not the language', () => {
    expect(fingerprint('shellscript', 'echo a  \r\necho b\n')).toBe(fingerprint('shellscript', 'echo a\necho b'));
    expect(fingerprint('python', 'x')).not.toBe(fingerprint('shellscript', 'x'));
  });
});

describe('within a session', () => {
  it('stores a new cell config under a stable ID with its position and fingerprint', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one')]);
    setConfig(nb.cell(1), { persistentSession: true });

    const file = storedFile();
    expect(file.version).toBe(2);
    const [id, entry] = Object.entries(file.cells)[0] as [string, { index: number; fingerprint: string; config: unknown; }];
    expect(id).toMatch(/^c-[0-9a-f]{8}$/);
    expect(entry).toEqual({ index: 1, fingerprint: fingerprint('shellscript', 'echo one'), occurrence: 0, config: { persistentSession: true } });
    expect(readCellConfig(nb.cell(1))).toEqual({ persistentSession: true });
    expect(readCellConfig(nb.cell(0))).toBeNull();
  });

  it('follows a cell when cells are inserted above it or it is moved', () => {
    const nb = new FakeNotebook([sh('echo one'), sh('echo two'), sh('echo three')]);
    setConfig(nb.cell(1), { tag: 'two' });

    nb.insert(0, py('print(0)'));
    expect(readCellConfig(nb.cell(2))).toEqual({ tag: 'two' });

    nb.move(2, 0);
    expect(readCellConfig(nb.cell(0))).toEqual({ tag: 'two' });
    expect(readCellConfig(nb.cell(2))).toBeNull();
  });

  it('keeps the config of identical cells apart', () => {
    const nb = new FakeNotebook([sh('ls'), sh('ls')]);
    setConfig(nb.cell(0), { tag: 'first' });
    setConfig(nb.cell(1), { tag: 'second' });
    nb.move(1, 0);
    expect(readCellConfig(nb.cell(0))).toEqual({ tag: 'second' });
    expect(readCellConfig(nb.cell(1))).toEqual({ tag: 'first' });
  });

  it("drops a deleted cell's config when the notebook is saved, not before", () => {
    const nb = new FakeNotebook([sh('echo one'), sh('echo two')]);
    setConfig(nb.cell(0), { tag: 'one' });
    setConfig(nb.cell(1), { tag: 'two' });

    nb.remove(0);
    expect(Object.keys(storedFile().cells)).toHaveLength(2);

    onNotebookSaved(nb);
    const entries = Object.values(storedFile().cells) as Array<{ index: number; config: unknown; }>;
    expect(entries).toEqual([expect.objectContaining({ index: 0, config: { tag: 'two' } })]);
  });

  it('re-attaches config when every cell is replaced, e.g. by a revert', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one')]);
    setConfig(nb.cell(1), { tag: 'one' });

    nb.load([md('# Title'), sh('echo one')]); // same content, new cell objects
    expect(readCellConfig(nb.cell(1))).toEqual({ tag: 'one' });
  });

  it('removes the entry when a cell config becomes empty', () => {
    const nb = new FakeNotebook([sh('echo one')]);
    setConfig(nb.cell(0), { tag: 'one' });
    setConfig(nb.cell(0), {});
    expect(storedFile().cells).toEqual({});
  });
});

describe('after the markdown changes outside the notebook', () => {
  it('finds a cell that moved, by its code', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one'), sh('echo two')]);
    setConfig(nb.cell(2), { tag: 'two' });
    onNotebookSaved(nb);

    // e.g. edited in the text editor: a paragraph and a cell added above
    newSession(nb, [md('# Title'), md('New intro'), py('print(1)'), sh('echo one'), sh('echo two')]);
    expect(readCellConfig(nb.cell(4))).toEqual({ tag: 'two' });
    expect(readCellConfig(nb.cell(3))).toBeNull();
  });

  it('tells identical cells apart when other cells are added around them', () => {
    const nb = new FakeNotebook([sh('ls'), md('a'), sh('ls'), md('b'), sh('ls')]);
    setConfig(nb.cell(2), { tag: 'middle' });
    onNotebookSaved(nb);

    newSession(nb, [md('new'), sh('ls'), md('a'), sh('ls'), md('b'), sh('ls')]);
    expect(readCellConfig(nb.cell(3))).toEqual({ tag: 'middle' });
  });

  it('finds a cell whose code was edited in place, by position and language', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one')]);
    setConfig(nb.cell(1), { tag: 'one' });
    onNotebookSaved(nb);

    newSession(nb, [md('# Title'), sh('echo ONE, edited')]);
    expect(readCellConfig(nb.cell(1))).toEqual({ tag: 'one' });
  });

  it('does not attach config to a cell of another language at the old position', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one')]);
    setConfig(nb.cell(1), { tag: 'one' });
    onNotebookSaved(nb);

    newSession(nb, [md('# Title'), py('print(1)')]);
    expect(readCellConfig(nb.cell(1))).toBeNull();
  });

  it('keeps and flags config it cannot place, and re-attaches it if the cell returns', () => {
    const nb = new FakeNotebook([md('# Title'), sh('echo one'), sh('echo two')]);
    setConfig(nb.cell(1), { tag: 'one' });
    onNotebookSaved(nb);

    // cell edited and moved - no fingerprint match, and a different cell sits at index 1
    newSession(nb, [md('# Title'), py('print(1)'), sh('echo two'), sh('echo one, edited')]);
    setConfig(nb.cell(2), { tag: 'two' }); // any write persists the flag
    const entries = Object.values(storedFile().cells) as Array<{ config: { tag: string; }; unmatched?: boolean; }>;
    expect(entries.find(e => e.config.tag === 'one')?.unmatched).toBe(true);
    onNotebookSaved(nb);
    expect(Object.values(storedFile().cells)).toHaveLength(2); // not pruned

    newSession(nb, [md('# Title'), sh('echo one'), sh('echo two')]);
    expect(readCellConfig(nb.cell(1))).toEqual({ tag: 'one' });
  });
});

describe('files from earlier versions', () => {
  it('migrates index-keyed entries and attaches them by position', () => {
    const legacy = { '1': { config: { tag: 'one', executionHistory: [{ id: 'h' }] } }, '2': { config: { tag: 'two' } } };
    expect(migrateConfigFile(legacy)).toEqual({
      version: 2,
      cells: {
        'legacy-1': { index: 1, config: { tag: 'one', executionHistory: [{ id: 'h' }] } },
        'legacy-2': { index: 2, config: { tag: 'two' } },
      },
    });

    fs.writeFileSync(getNotebookConfigPath({ fsPath: '/notes/demo.md' }), JSON.stringify(legacy));
    const nb = new FakeNotebook([md('# Title'), sh('echo one'), sh('echo two')]);
    expect(readCellConfig(nb.cell(1))).toEqual({ tag: 'one', executionHistory: [{ id: 'h' }] });

    // after the first save the entries carry fingerprints and follow the cells
    onNotebookSaved(nb);
    expect(readConfigFile({ fsPath: '/notes/demo.md' }).cells['legacy-1'].fingerprint).toBe(fingerprint('shellscript', 'echo one'));
    newSession(nb, [md('# Title'), md('added'), sh('echo one'), sh('echo two')]);
    expect(readCellConfig(nb.cell(2))).toEqual({ tag: 'one', executionHistory: [{ id: 'h' }] });
  });
});
