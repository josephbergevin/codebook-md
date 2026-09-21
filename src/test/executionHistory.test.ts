import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotebookCell } from 'vscode';

let mockConfigDir = '';
let mockHistorySettings = { enabled: true, historyLimit: 10 };

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn((section?: string) => ({
      get: (key: string, fallback?: unknown) => {
        if (section === 'codebook-md.executionHistory') {
          return (mockHistorySettings as Record<string, unknown>)[key] ?? fallback;
        }
        return key === 'notebookConfigPath' ? mockConfigDir : fallback;
      },
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
  addHistoryEntry, clearHistoryForCell, deleteHistoryEntry, getExecutionHistoryConfig, getHistoryForCell,
} from '../cellConfig';
import { __test__ as storeTest } from '../cellStore';
import { ExecutionHistoryEntry, ExecutionStatus } from '../types/executionHistory';

// A notebook with a markdown cell and two shell cells; cells keep their
// document URI when they move, as in VS Code
function makeNotebook() {
  const notebook = {
    uri: { toString: () => 'file:///test/notebook.md', fsPath: '/test/notebook.md' },
    cells: [] as NotebookCell[],
    getCells() { return this.cells; },
    move(from: number, to: number) {
      const [cell] = this.cells.splice(from, 1);
      this.cells.splice(to, 0, cell);
      this.cells.forEach((c, i) => { (c as { index: number; }).index = i; });
    },
  };
  notebook.cells = ['# Title', 'echo one', 'echo two'].map((code, index) => ({
    index,
    kind: index === 0 ? 1 : 2,
    notebook,
    document: { uri: { toString: () => `cell-${index}` }, languageId: index === 0 ? 'markdown' : 'shellscript', getText: () => code },
  }) as unknown as NotebookCell);
  return notebook;
}

let entryCount = 0;
function entry(overrides: Partial<ExecutionHistoryEntry> = {}): ExecutionHistoryEntry {
  entryCount++;
  return {
    id: `e${entryCount}`,
    cellIndex: 1,
    languageId: 'shellscript',
    code: 'echo one',
    output: 'one',
    status: ExecutionStatus.Success,
    timestamp: new Date(2026, 0, 1, 0, 0, entryCount).toISOString(),
    ...overrides,
  };
}

let notebook: ReturnType<typeof makeNotebook>;

beforeEach(() => {
  mockConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'));
  mockHistorySettings = { enabled: true, historyLimit: 10 };
  storeTest.resetState();
  notebook = makeNotebook();
});

afterEach(() => {
  fs.rmSync(mockConfigDir, { recursive: true, force: true });
});

describe('getExecutionHistoryConfig', () => {
  it('reads the history settings', () => {
    mockHistorySettings = { enabled: false, historyLimit: 3 };
    expect(getExecutionHistoryConfig()).toEqual({ enabled: false, historyLimit: 3 });
  });
});

describe('addHistoryEntry / getHistoryForCell', () => {
  it('records runs per cell, newest first', () => {
    const [, one, two] = notebook.cells;
    const first = entry();
    const second = entry();
    expect(addHistoryEntry(one, first)).toBe(true);
    expect(addHistoryEntry(one, second)).toBe(true);
    expect(addHistoryEntry(two, entry({ code: 'echo two' }))).toBe(true);

    expect(getHistoryForCell(one).map(e => e.id)).toEqual([second.id, first.id]);
    expect(getHistoryForCell(two)).toHaveLength(1);
    expect(getHistoryForCell(notebook.cells[0])).toEqual([]);
  });

  it('keeps at most historyLimit entries, or all of them for 0', () => {
    const one = notebook.cells[1];
    mockHistorySettings.historyLimit = 2;
    for (let i = 0; i < 4; i++) {
      addHistoryEntry(one, entry());
    }
    expect(getHistoryForCell(one)).toHaveLength(2);

    mockHistorySettings.historyLimit = 0;
    for (let i = 0; i < 4; i++) {
      addHistoryEntry(one, entry());
    }
    expect(getHistoryForCell(one)).toHaveLength(6);
  });

  it('records nothing when history is disabled', () => {
    mockHistorySettings.enabled = false;
    expect(addHistoryEntry(notebook.cells[1], entry())).toBe(false);
    expect(getHistoryForCell(notebook.cells[1])).toEqual([]);
  });

  it('keeps optional fields', () => {
    const failed = entry({ status: ExecutionStatus.Failure, errorMessage: 'boom', exitCode: 2, duration: 40 });
    addHistoryEntry(notebook.cells[1], failed);
    expect(getHistoryForCell(notebook.cells[1])[0]).toEqual(failed);
  });

  it('follows a cell when it moves', () => {
    const one = notebook.cells[1];
    addHistoryEntry(one, entry());
    notebook.move(1, 2);
    expect(getHistoryForCell(notebook.cells[2])).toHaveLength(1);
    expect(getHistoryForCell(notebook.cells[1])).toEqual([]);
  });
});

describe('clearHistoryForCell / deleteHistoryEntry', () => {
  it("clears one cell's history and leaves the others", () => {
    const [, one, two] = notebook.cells;
    addHistoryEntry(one, entry());
    addHistoryEntry(two, entry());
    expect(clearHistoryForCell(one)).toBe(true);
    expect(getHistoryForCell(one)).toEqual([]);
    expect(getHistoryForCell(two)).toHaveLength(1);
  });

  it('succeeds when there is nothing to clear', () => {
    expect(clearHistoryForCell(notebook.cells[1])).toBe(true);
  });

  it('deletes a single entry', () => {
    const one = notebook.cells[1];
    const keep = entry();
    const drop = entry();
    addHistoryEntry(one, keep);
    addHistoryEntry(one, drop);
    expect(deleteHistoryEntry(one, drop.id)).toBe(true);
    expect(getHistoryForCell(one)).toEqual([keep]);
    expect(deleteHistoryEntry(one, 'missing')).toBe(false);
  });
});
