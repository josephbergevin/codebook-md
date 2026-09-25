// filepath: /Users/tijoe/go/src/github.com/josephbergevin/codebook-md/__mocks__/vscode.js
/* eslint-disable @typescript-eslint/no-var-requires */
const jestMock = require('jest-mock');

const vscode = {
  window: {
    showInformationMessage: jestMock.fn(),
    showErrorMessage: jestMock.fn(),
    showInputBox: jestMock.fn(),
    showQuickPick: jestMock.fn(),
    createOutputChannel: jestMock.fn(() => ({
      appendLine: jestMock.fn(),
      show: jestMock.fn(),
      clear: jestMock.fn(),
      dispose: jestMock.fn(),
    })),
    showTextDocument: jestMock.fn(),
    showWarningMessage: jestMock.fn(),
    activeNotebookEditor: undefined,
    activeTextEditor: undefined,
    tabGroups: {
      activeTabGroup: { viewColumn: 1, tabs: [] },
      all: [],
      close: jestMock.fn(async () => true),
    },
  },
  workspace: {
    getConfiguration: jestMock.fn((section) => {
      if (section === 'codebook-md') {
        return {
          get: jestMock.fn((key, defaultValue) => {
            if (key === 'notebookConfigPath') {
              return '${notebookPath}.config.json';
            }
            if (key === 'rootPath') {
              return '';
            }
            return defaultValue;
          }),
          update: jestMock.fn(),
        };
      }
      return {
        get: jestMock.fn(),
        update: jestMock.fn(),
      };
    }),
    openTextDocument: jestMock.fn(),
    applyEdit: jestMock.fn(async () => true),
    onDidChangeConfiguration: jestMock.fn(() => ({ dispose: jestMock.fn() })),
    workspaceFolders: [],
  },
  env: {
    clipboard: {
      writeText: jestMock.fn(async () => undefined),
    },
  },
  commands: {
    registerCommand: jestMock.fn(),
    executeCommand: jestMock.fn(),
  },
  Uri: {
    file: jestMock.fn(path => ({ path })),
    parse: jestMock.fn(),
  },
  Position: jestMock.fn((line, character) => ({ line, character })),
  // Range(start, end) or Range(startLine, startChar, endLine, endChar)
  Range: jestMock.fn((a, b, c, d) => (d === undefined
    ? { start: a, end: b }
    : { start: { line: a, character: b }, end: { line: c, character: d } })),
  WorkspaceEdit: jestMock.fn(() => {
    const edits = [];
    return {
      edits,
      replace: jestMock.fn((uri, range, newText) => edits.push({ uri, range, newText })),
    };
  }),
  NotebookCellKind: {
    Markup: 1,
    Code: 2,
  },
  notebooks: {
    createRendererMessaging: jestMock.fn(() => ({
      onDidReceiveMessage: jestMock.fn(() => ({ dispose: jestMock.fn() })),
      postMessage: jestMock.fn(),
    })),
  },
  ThemeIcon: jestMock.fn((id) => ({ id })),
  EventEmitter: jestMock.fn(() => ({
    event: jestMock.fn(),
    fire: jestMock.fn(),
    dispose: jestMock.fn(),
  })),
  StatusBarAlignment: {
    Left: 'Left',
    Right: 'Right',
  },
  ViewColumn: {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3,
  },
  TabInputText: class {
    constructor(uri) {
      this.uri = uri;
    }
  },
  QuickPickItem: class {},
  QuickInputButton: class {},
};

module.exports = vscode;
