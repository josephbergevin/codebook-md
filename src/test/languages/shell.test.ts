import * as vscode from 'vscode';
import { Cell } from '../../languages/shell';

// Mock the fs module to prevent actual file operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

// Mock the codebook module - shell.ts uses CodeBlockConfig, parseCommands and Command
jest.mock('../../codebook', () => {
  return {
    CodeBlockConfig: jest.fn().mockImplementation((cell) => {
      return {
        innerScope: cell ? cell.document.getText() : '',
        commands: [],
        comments: [],
        execPath: '',
        languageId: 'shellscript',
        jsonStringify: jest.fn().mockReturnValue('{}')
      };
    }),
    Command: jest.fn().mockImplementation((command, args, cwd) => {
      return {
        command,
        args,
        cwd,
        execute: jest.fn(),
        addBeforeExecuteFunc: jest.fn(),
        setCommandToDisplay: jest.fn()
      };
    }),
    parseCommands: jest.fn().mockReturnValue([
      { command: 'echo', args: ['hello'] }
    ]),
    newCodeDocumentCurrentFile: jest.fn().mockReturnValue({ fileDir: '/test/path' })
  };
});

// Mock specific VS Code functions
jest.mock('vscode', () => {
  const mockConfig = (configName: string) => {
    if (configName === 'codebook-md.bash') {
      return {
        get: (key: string) => {
          switch (key) {
            case 'execSingleLineAsCommand': return false;
            default: return undefined;
          }
        }
      };
    } else if (configName === 'codebook-md.bash.output') {
      return {
        get: (key: string) => {
          switch (key) {
            case 'showExecutableCodeInOutput': return true;
            case 'replaceOutputCell': return true;
            case 'showTimestamp': return true;
            case 'timestampTimezone': return 'UTC';
            default: return undefined;
          }
        }
      };
    }
    return { get: jest.fn() };
  };

  return {
    workspace: {
      getConfiguration: jest.fn().mockImplementation(mockConfig),
      workspaceFolders: []
    }
  };
});

// Mock config module to avoid file system operations
jest.mock('../../config', () => ({
  getExecPath: jest.fn().mockReturnValue('/test/path')
}));

// Mock the io module
jest.mock('../../io', () => ({
  mkdirIfNotExistsSafe: jest.fn(),
  writeDirAndFileSyncSafe: jest.fn(),
  commandNotOnPath: jest.fn().mockReturnValue(false)
}));

const createMockNotebookCell = (content: string) => ({
  document: {
    languageId: 'shellscript',
    getText: () => content,
    uri: { fsPath: 'test.md' }
  },
  metadata: {
    custom: {}
  }
} as unknown as vscode.NotebookCell);

describe('Shell Language Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configuration keys', () => {
    // Regression: shell.ts previously read 'codebook-md.shell' and
    // 'codebook-md.shell.output', neither of which is declared in
    // package.json. Shell cells therefore ignored the documented
    // 'codebook-md.bash.*' settings and silently used defaults.
    it('reads settings from the declared codebook-md.bash section', () => {
      new Cell(createMockNotebookCell('echo "hello"'));

      const sections = (vscode.workspace.getConfiguration as jest.Mock).mock.calls
        .map(call => call[0]);

      expect(sections).toContain('codebook-md.bash');
    });

    it('reads output settings from codebook-md.bash.output', () => {
      new Cell(createMockNotebookCell('echo "hello"'));

      const sections = (vscode.workspace.getConfiguration as jest.Mock).mock.calls
        .map(call => call[0]);

      expect(sections).toContain('codebook-md.bash.output');
    });

    it('does not read from the undeclared codebook-md.shell section', () => {
      new Cell(createMockNotebookCell('echo "hello"'));

      const sections = (vscode.workspace.getConfiguration as jest.Mock).mock.calls
        .map(call => call[0]);

      expect(sections).not.toContain('codebook-md.shell');
      expect(sections).not.toContain('codebook-md.shell.output');
    });
  });

  describe('Cell construction', () => {
    it('builds a bash executable for the parsed commands', () => {
      const cell = new Cell(createMockNotebookCell('echo "hello"'));

      expect(cell.executables()).toHaveLength(1);
      expect(cell.commandCount).toBe(1);
    });

    it('uses "#" as the comment prefix', () => {
      const cell = new Cell(createMockNotebookCell('echo "hello"'));

      expect(cell.commentPrefixes()).toEqual(['#']);
      expect(cell.defaultCommentPrefix()).toBe('#');
    });

    it('allows keeping output only for a single command', () => {
      const codebook = jest.requireMock('../../codebook');

      codebook.parseCommands.mockReturnValueOnce([{ command: 'echo', args: ['one'] }]);
      expect(new Cell(createMockNotebookCell('echo one')).allowKeepOutput()).toBe(true);

      codebook.parseCommands.mockReturnValueOnce([
        { command: 'echo', args: ['one'] },
        { command: 'echo', args: ['two'] }
      ]);
      expect(new Cell(createMockNotebookCell('echo one\necho two')).allowKeepOutput()).toBe(false);
    });
  });
});
