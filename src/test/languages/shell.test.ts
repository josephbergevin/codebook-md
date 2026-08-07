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
      return { get: jest.fn() };
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

  describe('generated script', () => {
    // Regression: shell.ts used to tokenize each line via parseCommands and
    // rebuild it as `cmd "arg1" "arg2" ...`. That turned shell operators into
    // literal quoted arguments, so `echo $PATH | tr ':' '\n'` ran as
    // `echo "$PATH" "|" "tr" "':'" "'\n'"` and printed the pipeline instead of
    // executing it. The cell body is now passed to `bash -c` verbatim.
    it('preserves a pipeline verbatim', () => {
      const script = "echo $PATH | tr ':' '\\n'";
      const cell = new Cell(createMockNotebookCell(script));

      expect(cell.executableCode).toContain(script);
      expect(cell.executableCode).not.toContain('"|"');
    });

    it('does not wrap arguments in quotes', () => {
      const cell = new Cell(createMockNotebookCell('echo $PATH'));

      expect(cell.executableCode).toContain('echo $PATH');
      expect(cell.executableCode).not.toContain('"$PATH"');
    });

    it.each([
      ['redirect', 'ls > out.txt'],
      ['append redirect', 'echo hi >> log.txt'],
      ['logical and', 'mkdir -p dir && cd dir'],
      ['semicolon', 'cd /tmp; pwd'],
      ['glob', 'ls *.md'],
      ['command substitution', 'echo $(date +%s)'],
      ['single quotes', "grep -o 'a:b' file"],
      ['subshell', '(cd /tmp && pwd)'],
    ])('preserves %s syntax', (_label: string, script: string) => {
      const cell = new Cell(createMockNotebookCell(script));

      expect(cell.executableCode).toContain(script);
    });

    it('preserves multi-line constructs', () => {
      const script = 'for f in *.md; do\n  echo "$f"\ndone';
      const cell = new Cell(createMockNotebookCell(script));

      expect(cell.executableCode).toContain(script);
    });

    it('keeps the shebang and set -e prologue', () => {
      const cell = new Cell(createMockNotebookCell('echo hello'));

      expect(cell.executableCode.startsWith('#!/bin/bash\nset -e\n')).toBe(true);
    });

    it('passes the script to bash -c', () => {
      const cell = new Cell(createMockNotebookCell('echo hello'));
      const executable = cell.executables()[0] as unknown as { command: string; args: string[]; };

      expect(executable.command).toBe('bash');
      expect(executable.args[0]).toBe('-c');
      expect(executable.args[1]).toBe(cell.executableCode);
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
