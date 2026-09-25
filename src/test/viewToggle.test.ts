import * as vscode from 'vscode';
import { openAsNotebook } from '../codeLens';
import { switchToNotebook, switchToText, toggleView } from '../viewToggle';

jest.mock('../codeLens', () => ({
  openAsNotebook: jest.fn(async () => ({})),
}));

type MutableWindow = {
  activeNotebookEditor: unknown;
  activeTextEditor: unknown;
  tabGroups: { activeTabGroup: unknown; all: unknown[]; close: jest.Mock };
};
const win = vscode.window as unknown as MutableWindow;

const fileUri = { toString: () => 'file:///notes.md' } as vscode.Uri;
const otherUri = { toString: () => 'file:///other.md' } as vscode.Uri;

function textTab(uri: vscode.Uri, isDirty = false) {
  return { input: new vscode.TabInputText(uri), isDirty };
}

/** Puts the given tabs in view column 1 */
function setTabs(tabs: unknown[]): void {
  const group = { viewColumn: 1, tabs };
  win.tabGroups.activeTabGroup = group;
  win.tabGroups.all = [group];
}

beforeEach(() => {
  jest.clearAllMocks();
  // The shared vscode mock is built with the standalone jest-mock package,
  // which jest.clearAllMocks() doesn't reach
  (vscode.commands.executeCommand as jest.Mock).mockClear();
  (vscode.window.showInformationMessage as jest.Mock).mockClear();
  win.tabGroups.close.mockClear();
  win.activeNotebookEditor = undefined;
  win.activeTextEditor = undefined;
  setTabs([]);
});

describe('switchToText', () => {
  test('reopens a CodebookMD notebook in the text editor', async () => {
    win.activeNotebookEditor = { notebook: { notebookType: 'codebook-md' } };
    expect(await switchToText()).toBe(true);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reopenTextEditor');
  });

  test('leaves other notebook types alone', async () => {
    win.activeNotebookEditor = { notebook: { notebookType: 'jupyter-notebook' } };
    expect(await switchToText()).toBe(false);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  test('does nothing without a notebook', async () => {
    expect(await switchToText()).toBe(false);
  });
});

describe('switchToNotebook', () => {
  test('opens the file as a notebook', async () => {
    await switchToNotebook(fileUri);
    expect(openAsNotebook).toHaveBeenCalledWith(fileUri);
  });

  test('closes the text tab left behind, so tabs don\'t pile up', async () => {
    const tab = textTab(fileUri);
    setTabs([tab]);
    await switchToNotebook(fileUri);
    expect(win.tabGroups.close).toHaveBeenCalledWith(tab, true);
  });

  test('closes nothing when VS Code already replaced the text tab', async () => {
    setTabs([{ input: {}, isDirty: false }]);
    await switchToNotebook(fileUri);
    expect(win.tabGroups.close).not.toHaveBeenCalled();
  });

  test('leaves other files\' tabs open', async () => {
    setTabs([textTab(otherUri)]);
    await switchToNotebook(fileUri);
    expect(win.tabGroups.close).not.toHaveBeenCalled();
  });

  test('never closes a tab with unsaved changes', async () => {
    setTabs([textTab(fileUri, true)]);
    await switchToNotebook(fileUri);
    expect(win.tabGroups.close).not.toHaveBeenCalled();
  });

  test('keeps the text tab when the notebook fails to open', async () => {
    (openAsNotebook as jest.Mock).mockResolvedValueOnce(undefined);
    setTabs([textTab(fileUri)]);
    expect(await switchToNotebook(fileUri)).toBe(false);
    expect(win.tabGroups.close).not.toHaveBeenCalled();
  });

  test('uses the active text editor\'s file by default', async () => {
    win.activeTextEditor = { document: { uri: fileUri } };
    await switchToNotebook();
    expect(openAsNotebook).toHaveBeenCalledWith(fileUri);
  });

  test('does nothing without a file', async () => {
    expect(await switchToNotebook()).toBe(false);
    expect(openAsNotebook).not.toHaveBeenCalled();
  });
});

describe('toggleView', () => {
  test('switches a CodebookMD notebook to text', async () => {
    win.activeNotebookEditor = { notebook: { notebookType: 'codebook-md' } };
    await toggleView();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reopenTextEditor');
    expect(openAsNotebook).not.toHaveBeenCalled();
  });

  test('switches a markdown text editor to the notebook', async () => {
    win.activeTextEditor = { document: { uri: fileUri, languageId: 'markdown' } };
    await toggleView();
    expect(openAsNotebook).toHaveBeenCalledWith(fileUri);
  });

  test('explains itself when neither view is active', async () => {
    win.activeTextEditor = { document: { uri: fileUri, languageId: 'typescript' } };
    await toggleView();
    expect(openAsNotebook).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });
});
