import * as codebook from '../codebook';
import { NotebookCell, WorkspaceConfiguration } from 'vscode';

jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
}));

describe('md.ts Test Suite', () => {
  it('permalinkToCodeDocument should return the correct message', () => {
    const permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L15';
    const permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
    const workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
    const codeDoc = codebook.permalinkToCodeDocument(permalink, permalinkPrefix, workspaceRoot);
    expect(codeDoc).toEqual(new codebook.CodeDocument(
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
      9,
      15,
      'ts',
    ));
    expect(codeDoc.absoluteFileLocPos()).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9');
  });

  it('CodeDocument - no file location', () => {
    const line = 'hello';
    const got = codebook.findCodeDocument(line);
    const want = null;
    expect(got).toBe(want);
  });

  it('CodeDocument - file location, no line numbers', () => {
    const line = 'here is a file: ../extension.ts';
    const got = codebook.findCodeDocument(line);
    const want = "../extension.ts";
    expect(got).toBe(want);
  });

  it('CodeDocument - file location with begin line number', () => {
    const line = 'here is a file: (../extension.ts:9)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9';
    expect(got).toBe(want);
  });

  it('CodeDocument - file location with line numbers', () => {
    const line = 'here is a file: (../extension.ts:9-15)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9-15';
    expect(got).toBe(want);
  });

  it('CodeDocument - file location in go', () => {
    const line = '    fmt.Println("./example.ts")';
    const got = codebook.findCodeDocument(line);
    const want = './example.ts';
    expect(got).toBe(want);
  });
});

describe('parseCommandAndArgs', () => {
  it('should parse command and arguments correctly', () => {
    const fullCmd = 'echo "Hello World"';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('echo');
    expect(command.args).toEqual(['Hello World']);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle commands without arguments', () => {
    const fullCmd = 'ls';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('ls');
    expect(command.args).toEqual([]);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle empty command string', () => {
    const fullCmd = '';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('');
    expect(command.args).toEqual([]);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle multiple arguments', () => {
    const fullCmd = 'git commit -m "Initial commit"';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('git');
    expect(command.args).toEqual(['commit', '-m', 'Initial commit']);
    expect(command.cwd).toBe(cwd);
  });
});

describe('parseCommands', () => {
  it('should parse multiple commands correctly', () => {
    const fullCmd = 'echo "Hello World"\nls -la\n# This is a comment\ngit status';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(3);

    expect(commands[0].command).toBe('echo');
    expect(commands[0].args).toEqual(['Hello World']);
    expect(commands[0].cwd).toBe(cwd);

    expect(commands[1].command).toBe('ls');
    expect(commands[1].args).toEqual(['-la']);
    expect(commands[1].cwd).toBe(cwd);

    expect(commands[2].command).toBe('git');
    expect(commands[2].args).toEqual(['status']);
    expect(commands[2].cwd).toBe(cwd);
  });

  it('should handle empty command string', () => {
    const fullCmd = '';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(0);
  });

  it('should handle commands with only comments', () => {
    const fullCmd = '# This is a comment\n# Another comment';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(0);
  });

  it('should handle commands with leading and trailing whitespace', () => {
    const fullCmd = '  echo "Hello World"  \n  ls -la  ';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(2);

    expect(commands[0].command).toBe('echo');
    expect(commands[0].args).toEqual(['Hello World']);
    expect(commands[0].cwd).toBe(cwd);

    expect(commands[1].command).toBe('ls');
    expect(commands[1].args).toEqual(['-la']);
    expect(commands[1].cwd).toBe(cwd);
  });
});

describe('CellContentConfig', () => {
  it('should create correct config when called from Go', () => {
    // Mock NotebookCell with Go code
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('fmt.Println("Hello")\n// [>].output.showExecutableCodeInOutput(true)\n// This is a comment\n'),
        languageId: 'go'
      } as unknown
    } as NotebookCell;

    // Mock workspace configuration with all required methods
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    // Verify the configuration was parsed correctly
    expect(cellConfig.innerScope).toBe('fmt.Println("Hello")');
    expect(cellConfig.comments).toEqual(['// This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(cellConfig.execFrom).toBe('');
    expect(cellConfig.output.showExecutableCodeInOutput).toBe(true);
  });

  it('should create correct config when called from Bash', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('echo "Hello"\n# [>].output.showTimestamp(true)\n# This is a comment\n'),
        languageId: 'bash'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(cellConfig.innerScope).toBe('echo "Hello"');
    expect(cellConfig.comments).toEqual(['# This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showTimestamp(true)']);
    expect(cellConfig.output.showTimestamp).toBe(true);
  });

  it('should create correct config when called from JavaScript', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('console.log("Hello");\n// [>].output.replaceOutputCell(false)\n// This is a comment\n'),
        languageId: 'javascript'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    expect(cellConfig.innerScope).toBe('console.log("Hello");');
    expect(cellConfig.comments).toEqual(['// This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.replaceOutputCell(false)']);
    expect(cellConfig.output.replaceOutputCell).toBe(false);
  });

  it('should create correct config when called from Python', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('print("Hello")\n# [>].output.showOutputOnRun(true)\n# This is a comment\n'),
        languageId: 'python'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(cellConfig.innerScope).toBe('print("Hello")');
    expect(cellConfig.comments).toEqual(['# This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showOutputOnRun(true)']);
    expect(cellConfig.output.showOutputOnRun).toBe(true);
  });

  it('should create correct config when called from Shell', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('ls -la\n# [>].output.showTimestamp(true)\n# This is a comment\n'),
        languageId: 'shell'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(cellConfig.innerScope).toBe('ls -la');
    expect(cellConfig.comments).toEqual(['# This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showTimestamp(true)']);
    expect(cellConfig.output.showTimestamp).toBe(true);
  });

  it('should create correct config when called from SQL', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('SELECT * FROM users;\n-- [>].output.showExecutableCodeInOutput(true)\n-- This is a comment\n'),
        languageId: 'sql'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "--");

    expect(cellConfig.innerScope).toBe('SELECT * FROM users;');
    expect(cellConfig.comments).toEqual(['-- This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(cellConfig.output.showExecutableCodeInOutput).toBe(true);
  });

  it('should create correct config when called from TypeScript', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('console.log("Hello");\n// [>].output.showExecutableCodeInOutput(true)\n// This is a comment\n'),
        languageId: 'typescript'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
          case 'showOutputOnRun': return false;
          case 'replaceOutputCell': return true;
          case 'showTimestamp': return false;
          case 'timestampTimezone': return '';
          default: return undefined;
        }
      }),
      has: jest.fn().mockReturnValue(true),
      inspect: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined)
    } as WorkspaceConfiguration;

    const cellConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    expect(cellConfig.innerScope).toBe('console.log("Hello");');
    expect(cellConfig.comments).toEqual(['// This is a comment']);
    expect(cellConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(cellConfig.output.showExecutableCodeInOutput).toBe(true);
  });
});
