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
    workspaceFolders: [],
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
  Range: jestMock.fn((start, end) => ({ start, end })),
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
  QuickPickItem: class {},
  QuickInputButton: class {},
};

module.exports = vscode;
