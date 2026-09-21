// Save and history handling of the config modal, driven through its message handler

const mockNotebookDocuments: unknown[] = [];

jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    setStatusBarMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), clear: jest.fn(), dispose: jest.fn() })),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({ get: (_key: string, fallback: unknown) => fallback, inspect: () => undefined, update: jest.fn() })),
    notebookDocuments: mockNotebookDocuments,
    openNotebookDocument: jest.fn(),
    workspaceFolders: [{ uri: { fsPath: '/ws' } }],
  },
  commands: { executeCommand: jest.fn(), registerCommand: jest.fn() },
  languages: { registerHoverProvider: jest.fn() },
  env: { clipboard: { writeText: jest.fn() } },
  Uri: { parse: jest.fn((value: string) => ({ toString: () => value, fsPath: value.replace('file://', '') })) },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  NotebookCellKind: { Markup: 1, Code: 2 },
}));

const mockCellConfigs = new Map<string, Record<string, unknown> | null>();

jest.mock('../../codebook', () => ({
  getCellConfig: jest.fn((cell: { document: { uri: { toString(): string; }; }; }) =>
    mockCellConfigs.get(cell.document.uri.toString()) ?? null),
  explicitSetting: jest.fn(() => undefined),
}));

jest.mock('../../cellConfig', () => {
  const actual = jest.requireActual('../../cellConfig');
  return {
    ...actual,
    saveCellConfig: jest.fn().mockResolvedValue(true),
    getHistoryForCell: jest.fn(() => [{ id: 'a' }, { id: 'b' }]),
    clearHistoryForCell: jest.fn(() => true),
    deleteHistoryEntry: jest.fn(() => true),
  };
});

import * as vscode from 'vscode';
import * as cellConfig from '../../cellConfig';
import { __test__ } from '../../webview/configModal';

const notebookUri = 'file:///notes/demo.md';

function makeCell(index: number, languageId: string, uri: string) {
  return {
    index,
    notebook: { uri: { toString: () => notebookUri, fsPath: '/notes/demo.md' } },
    document: { languageId, uri: { toString: () => uri } },
  };
}

// The cells in document order; tests insert a cell to shift indexes
let cells: ReturnType<typeof makeCell>[];

beforeEach(() => {
  jest.clearAllMocks();
  __test__.resetState();
  mockCellConfigs.clear();
  cells = [makeCell(0, 'markdown', 'cell-a'), makeCell(1, 'shellscript', 'cell-b')];
  mockNotebookDocuments.length = 0;
  mockNotebookDocuments.push({ uri: { toString: () => notebookUri }, getCells: () => cells });
});

describe('saveConfig', () => {
  it('saves only the overrides and keeps the execution history', async () => {
    const history = [{ id: 'h1' }];
    mockCellConfigs.set('cell-b', { executionHistory: history, output: { showTimestamp: true, replaceOutputCell: true } });

    await __test__.handleMessage({
      command: 'saveConfig', notebookUri, cellUri: 'cell-b', languageId: 'shellscript',
      overrides: { persistentSession: true, 'output.showTimestamp': false },
    });

    expect(cellConfig.saveCellConfig).toHaveBeenCalledWith(cells[1], {
      executionHistory: history,
      persistentSession: true,
      output: { showTimestamp: false },
    });
  });

  it('saves to the same cell after a cell is inserted above it', async () => {
    cells = [makeCell(0, 'markdown', 'cell-a'), makeCell(1, 'python', 'cell-new'), { ...cells[1], index: 2 }];

    await __test__.handleMessage({
      command: 'saveConfig', notebookUri, cellUri: 'cell-b', languageId: 'shellscript', overrides: {},
    });

    const [savedCell] = (cellConfig.saveCellConfig as jest.Mock).mock.calls[0];
    expect(savedCell.document.uri.toString()).toBe('cell-b');
    expect(savedCell.index).toBe(2);
  });

  it('refuses to save when the cell is gone', async () => {
    await __test__.handleMessage({
      command: 'saveConfig', notebookUri, cellUri: 'cell-deleted', languageId: 'shellscript', overrides: {},
    });
    expect(cellConfig.saveCellConfig).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('no longer exists'));
  });

  it("refuses to save when the cell's language changed", async () => {
    await __test__.handleMessage({
      command: 'saveConfig', notebookUri, cellUri: 'cell-b', languageId: 'python', overrides: {},
    });
    expect(cellConfig.saveCellConfig).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('language changed'));
  });
});

describe('history messages', () => {
  it('asks for confirmation before clearing, since webviews cannot', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);
    await __test__.handleMessage({ command: 'clearHistory', notebookUri, cellUri: 'cell-b' });
    expect(cellConfig.clearHistoryForCell).not.toHaveBeenCalled();

    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Clear');
    await __test__.handleMessage({ command: 'clearHistory', notebookUri, cellUri: 'cell-b' });
    expect(cellConfig.clearHistoryForCell).toHaveBeenCalledWith(cells[1]);
  });
});

describe('settings the page may change', () => {
  it('writes the history settings to the workspace, and nothing else', async () => {
    const update = jest.fn();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn(), inspect: jest.fn(), update });

    await __test__.handleMessage({ command: 'updateWorkspaceSetting', key: 'executionHistory.historyLimit', value: 5 });
    await __test__.handleMessage({ command: 'updateWorkspaceSetting', key: 'rootPath', value: '/etc' });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('executionHistory.historyLimit', 5, vscode.ConfigurationTarget.Workspace);
  });

  it('only opens CodebookMD settings', async () => {
    await __test__.handleMessage({ command: 'openSpecificSetting', settingId: 'terminal.integrated.shell' });
    await __test__.handleMessage({ command: 'openSpecificSetting', settingId: 'codebook-md.bash.persistentSession' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'codebook-md.bash.persistentSession');
  });
});
