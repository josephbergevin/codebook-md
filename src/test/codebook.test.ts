// Setup the mock for vscode first, before any imports
jest.mock('vscode', () => {
  const mockWorkspace = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getConfiguration: jest.fn().mockImplementation((section) => {
      return {
        get: jest.fn().mockImplementation((key, defaultValue) => {
          if (key === 'rootPath') return '';
          if (key === 'notebookConfigPath') return '${notebookPath}.config.json';
          // For Front Matter configuration, default to hidden (false)
          if (section === 'codebook-md.frontMatter' && key === 'showInNotebook') return false;
          return defaultValue;
        }),
        update: jest.fn()
      };
    }),
    onDidOpenNotebookDocument: jest.fn(),
    registerNotebookSerializer: jest.fn()
  };

  return {
    workspace: mockWorkspace,
    window: {
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showInputBox: jest.fn(),
      createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        clear: jest.fn(),
        dispose: jest.fn()
      }))
    },
    NotebookCellKind: { Markup: 1, Code: 2 },
    languages: { registerHoverProvider: jest.fn() },
    commands: { registerCommand: jest.fn() }
  };
});

import * as codebook from '../codebook';
import {
  WorkspaceConfiguration, NotebookCell
} from 'vscode';
import * as fs from 'fs';
import * as config from '../config';

// Mock the config.ts module
jest.mock('../config', () => ({
  getExecPath: jest.fn().mockReturnValue('./codebook-md/'),
  getLanguageExecPath: jest.fn().mockReturnValue('./codebook-md/'),
  getCodebookMDExecPath: jest.fn().mockReturnValue('./codebook-md/'),
  getBaseExecConfig: jest.fn().mockReturnValue({
    showExecutableCodeInOutput: true,
    replaceOutputCell: true,
    showTimestamp: true,
    timestampTimezone: 'UTC'
  }),
  getGoConfig: jest.fn().mockReturnValue({
    execType: 'run',
    execTypeRunConfig: {
      execPath: '.',
      filename: 'main.go'
    },
    execTypeTestConfig: {
      execPath: '.',
      filename: 'codebook_md_exec_test.go',
      buildTag: 'playground'
    },
    goimportsCmd: 'gopls imports'
  }),
  getPythonConfig: jest.fn().mockReturnValue({
    pythonCmd: 'python3'
  }),
  getShellConfig: jest.fn().mockReturnValue({
    execSingleLineAsCommand: false
  }),
  getSQLConfig: jest.fn().mockReturnValue({
    execOptions: ''
  }),
  getHTTPConfig: jest.fn().mockReturnValue({
    execCmd: 'curl',
    execFilename: 'codebook_md_exec_http.sh',
    verbose: true
  })
}));

// Mock fs module for testing file existence
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn()
}));

// Mock the entire cellConfig module
jest.mock('../cellConfig', () => ({
  loadNotebookConfig: jest.fn().mockImplementation(() => {
    // Return a mock config for tests
    return {
      '0': {
        config: {
          output: {
            showExecutableCodeInOutput: true
          }
        }
      }
    };
  }),
  getNotebookConfigPath: jest.fn().mockImplementation(() => {
    return 'mockPath/notebook.md.config.json';
  }),
  saveNotebookConfig: jest.fn().mockImplementation(() => true),
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

  it('CodeDocument - workspace-level file location with line numbers', () => {
    const line = 'here is a file: (myfolder/extension.ts:9-15)';
    const got = codebook.findCodeDocument(line);
    const want = 'myfolder/extension.ts:9-15';
    expect(got).toBe(want);
  });

  it('CodeDocument - nested workspace-level file location with single line number', () => {
    const line = 'check this file: (src/languages/python.go:42)';
    const got = codebook.findCodeDocument(line);
    const want = 'src/languages/python.go:42';
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    // Verify the configuration was parsed correctly
    expect(codeBlockConfig.innerScope).toBe('fmt.Println("Hello")');
    expect(codeBlockConfig.comments).toEqual(['// This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(codeBlockConfig.execPath).toBe('');
    expect(codeBlockConfig.outputConfig.showExecutableCodeInOutput).toBe(true);
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(codeBlockConfig.innerScope).toBe('echo "Hello"');
    expect(codeBlockConfig.comments).toEqual(['# This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showTimestamp(true)']);
    expect(codeBlockConfig.outputConfig.showTimestamp).toBe(true);
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    expect(codeBlockConfig.innerScope).toBe('console.log("Hello");');
    expect(codeBlockConfig.comments).toEqual(['// This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.replaceOutputCell(false)']);
    expect(codeBlockConfig.outputConfig.replaceOutputCell).toBe(false);
  });

  it('should create correct config when called from Python', () => {
    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('print("Hello")\n# [>].output.showTimestamp(true)\n# This is a comment\n'),
        languageId: 'python'
      } as unknown
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(codeBlockConfig.innerScope).toBe('print("Hello")');
    expect(codeBlockConfig.comments).toEqual(['# This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showTimestamp(true)']);
    expect(codeBlockConfig.outputConfig.showTimestamp).toBe(true);
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "#");

    expect(codeBlockConfig.innerScope).toBe('ls -la');
    expect(codeBlockConfig.comments).toEqual(['# This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showTimestamp(true)']);
    expect(codeBlockConfig.outputConfig.showTimestamp).toBe(true);
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "--");

    expect(codeBlockConfig.innerScope).toBe('SELECT * FROM users;');
    expect(codeBlockConfig.comments).toEqual(['-- This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(codeBlockConfig.outputConfig.showExecutableCodeInOutput).toBe(true);
  });

  it('should create correct config when called with explicit cellConfig', () => {
    // Mock the getCellConfig function to return only showExecutableCodeInOutput
    jest.spyOn(codebook, 'getCellConfig').mockImplementation(() => ({
      output: {
        showExecutableCodeInOutput: true
      }
    }));

    const mockNotebookCell = {
      document: {
        getText: jest.fn().mockReturnValue('fmt.Println("Hello")\n'),
        languageId: 'go'
      } as unknown,
      notebook: {
        cellCount: 2,
        cellAt: jest.fn().mockReturnValue({
          document: {
            getText: jest.fn().mockReturnValue('<!-- CodebookMD Cell Configurations -->\nThis cell contains configurations for code cells in this notebook. Do not edit manually.\n\n<script type="application/json">\n{"0":{"language":"go","config":{"output":{"showExecutableCodeInOutput":true}}}}\n</script>')
          }
        })
      } as unknown,
      index: 0
    } as NotebookCell;

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'showExecutableCodeInOutput': return false;
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    // Verify the configuration was parsed correctly with the custom cellConfig
    expect(codeBlockConfig.innerScope).toBe('fmt.Println("Hello")');
    expect(codeBlockConfig.languageId).toBe('go');

    // Debug output to see what values we have
    console.log("Cell Config:", codeBlockConfig.cellConfig);
    console.log("Output Config:", {
      showExecutableCodeInOutput: codeBlockConfig.outputConfig.showExecutableCodeInOutput,
      replaceOutputCell: codeBlockConfig.outputConfig.replaceOutputCell,
      showTimestamp: codeBlockConfig.outputConfig.showTimestamp,
      timestampTimezone: codeBlockConfig.outputConfig.timestampTimezone
    });

    // Only showExecutableCodeInOutput should be set from the cell config
    expect(codeBlockConfig.outputConfig.showExecutableCodeInOutput).toBe(true);
    // The rest should be their default values (false/true/empty)
    expect(codeBlockConfig.outputConfig.replaceOutputCell).toBe(true);
    expect(codeBlockConfig.outputConfig.showTimestamp).toBe(false);
    // timestampTimezone default is '' (empty string) unless set in config
    expect([undefined, '', 'UTC']).toContain(codeBlockConfig.outputConfig.timestampTimezone);
    expect(codeBlockConfig.outputConfig.prependToOutputStrings).toEqual([]);
    expect(codeBlockConfig.outputConfig.appendToOutputStrings).toEqual([]);

    // Verify that the cell config was properly assigned
    expect(codeBlockConfig.cellConfig).toEqual({
      output: {
        showExecutableCodeInOutput: true
      }
    });

    // Restore the original implementations after the test
    // No need to restore the original OutputConfig class anymore
    // codebook.OutputConfig = OriginalOutputConfig;
    jest.restoreAllMocks();
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

    const codeBlockConfig = new codebook.CodeBlockConfig(mockNotebookCell, mockConfig, "//");

    expect(codeBlockConfig.innerScope).toBe('console.log("Hello");');
    expect(codeBlockConfig.comments).toEqual(['// This is a comment']);
    expect(codeBlockConfig.commands).toEqual(['.output.showExecutableCodeInOutput(true)']);
    expect(codeBlockConfig.outputConfig.showExecutableCodeInOutput).toBe(true);
  });
});

describe('Smart Relative Path Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use execPath resolution when file exists in execPath', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    // Setup mocks
    mockGetExecPath.mockReturnValue('./codebook-md-exec');
    mockExistsSync.mockImplementation((path: fs.PathLike) => {
      const pathStr = path.toString();
      // File exists in execPath - more precise matching
      return pathStr === '/workspace/docs/codebook-md-exec/src/test.ts';
    });

    const fileLoc = './src/test.ts';
    const resolvePath = '/workspace/docs/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should resolve to execPath version
    expect(result.fileLoc).toBe('/workspace/docs/codebook-md-exec/src/test.ts');
    expect(mockGetExecPath).toHaveBeenCalled();
  });

  it('should fallback to markdown directory when file does not exist in execPath', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    // Setup mocks
    mockGetExecPath.mockReturnValue('./codebook-md-exec');
    mockExistsSync.mockImplementation((path: fs.PathLike) => {
      const pathStr = path.toString();
      // File does NOT exist in execPath, but exists in markdown directory
      return pathStr.includes('/workspace/docs/src/test.ts') && !pathStr.includes('codebook-md-exec');
    });

    const fileLoc = './src/test.ts';
    const resolvePath = '/workspace/docs/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should fallback to markdown directory
    expect(result.fileLoc).toBe('/workspace/docs/src/test.ts');
    expect(mockGetExecPath).toHaveBeenCalled();
  });

  it('should handle absolute paths without modification', () => {
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    const fileLoc = '/absolute/path/to/test.ts';
    const resolvePath = '/workspace/docs/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should use absolute path as-is
    expect(result.fileLoc).toBe('/absolute/path/to/test.ts');
    // Should not call getExecPath for absolute paths
    expect(mockGetExecPath).not.toHaveBeenCalled();
  });

  it('should handle workspace-level file location', () => {
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    const fileLoc = 'myfolder/extension.ts';
    const resolvePath = '/workspace/docs/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should use absolute path as-is
    expect(result.fileLoc).toBe('/workspace/myfolder/extension.ts');
    // Should not call getExecPath for absolute paths
    expect(mockGetExecPath).not.toHaveBeenCalled();
  });


  it('should handle execPath resolution failure gracefully', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    // Setup mocks to simulate execPath failure
    mockGetExecPath.mockImplementation(() => {
      throw new Error('Unable to determine execPath');
    });
    mockExistsSync.mockReturnValue(false);

    const fileLoc = './src/test.ts';
    const resolvePath = '/workspace/docs/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should fallback to markdown directory even when execPath fails
    expect(result.fileLoc).toBe('/workspace/docs/src/test.ts');
    expect(mockGetExecPath).toHaveBeenCalled();
  });

  it('should parse line numbers correctly with smart resolution', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockGetExecPath = config.getExecPath as jest.MockedFunction<typeof config.getExecPath>;

    // Setup mocks
    mockGetExecPath.mockReturnValue('./codebook-md-exec');
    mockExistsSync.mockImplementation((path: fs.PathLike) => {
      const pathStr = path.toString();
      return pathStr.includes('/workspace/codebook-md-exec/src/test.ts');
    });

    const fileLoc = './src/test.ts:10-20';
    const resolvePath = '/workspace/README.md';

    const result = codebook.newCodeDocumentFromFileLoc(fileLoc, resolvePath);

    // Should resolve file path correctly and parse line numbers
    expect(result.fileLoc).toBe('/workspace/codebook-md-exec/src/test.ts');
    expect(result.lineBegin).toBe(10);
    expect(result.lineEnd).toBe(20);
    expect(result.language).toBe('ts');
  });

  it('should parse markdown with Front Matter correctly', () => {
    const markdownWithFrontMatter = `---
mode: "agent"
model: Claude Sonnet 4
tools: ["codebase"]
description: "Create a complete implementation for a new Nozzle extractor pack feature"
---

# Nozzle Extractor - Creating a New Pack Feature

Your goal is to create a complete implementation for a new pack feature in the Nozzle extractor system.

\`\`\`python
print("Hello, World!")
\`\`\`

This is another paragraph.`;

    const cells = codebook.parseMarkdown(markdownWithFrontMatter);

    // Should have 3 cells: markdown content, code block, and final markdown
    expect(cells).toHaveLength(3);

    // First cell should contain the header and first paragraph (Front Matter should be hidden)
    expect(cells[0].kind).toBe(1); // NotebookCellKind.Markup
    expect(cells[0].language).toBe('markdown');
    expect(cells[0].content).toBe('# Nozzle Extractor - Creating a New Pack Feature\n\nYour goal is to create a complete implementation for a new pack feature in the Nozzle extractor system.');

    // Second cell should be the Python code
    expect(cells[1].kind).toBe(2); // NotebookCellKind.Code
    expect(cells[1].language).toBe('python');
    expect(cells[1].content).toBe('print("Hello, World!")');

    // Third cell should be the final paragraph
    expect(cells[2].kind).toBe(1); // NotebookCellKind.Markup
    expect(cells[2].language).toBe('markdown');
    expect(cells[2].content).toBe('This is another paragraph.');

    // Ensure Front Matter is not present in any cell
    cells.forEach(cell => {
      expect(cell.content).not.toContain('mode: "agent"');
      expect(cell.content).not.toContain('model: Claude Sonnet 4');
    });
  });

  it('should parse markdown without Front Matter correctly', () => {
    const markdownWithoutFrontMatter = `# Regular Markdown

This is a regular markdown file without Front Matter.

\`\`\`javascript
console.log("Hello, World!");
\`\`\``;

    const cells = codebook.parseMarkdown(markdownWithoutFrontMatter);

    // Should have 2 cells: markdown content and code
    expect(cells).toHaveLength(2);

    // First cell should contain the header and paragraph
    expect(cells[0].content).toBe('# Regular Markdown\n\nThis is a regular markdown file without Front Matter.');

    // Second cell should be the JavaScript code
    expect(cells[1].content).toBe('console.log("Hello, World!");');
    expect(cells[1].language).toBe('javascript');
  });

  it('should handle malformed Front Matter correctly', () => {
    const markdownWithMalformedFrontMatter = `---
mode: "agent"
model: Claude Sonnet 4
description: "Missing closing marker"

# This should be treated as regular markdown

The Front Matter above is malformed (no closing ---) so it should be treated as regular content.`;

    const cells = codebook.parseMarkdown(markdownWithMalformedFrontMatter);

    // Should treat everything as regular markdown since Front Matter is malformed
    expect(cells).toHaveLength(1);

    // First cell should include the opening --- as regular content since it's malformed
    expect(cells[0].content).toContain('---');
    expect(cells[0].content).toContain('mode: "agent"');
    expect(cells[0].content).toContain('# This should be treated as regular markdown');
  });

  it('should show Front Matter when setting is enabled', () => {
    // Mock the configuration to return true for showInNotebook
    const { workspace } = jest.requireMock('vscode');
    workspace.getConfiguration.mockImplementation((section: string) => ({
      get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
        if (section === 'codebook-md.frontMatter' && key === 'showInNotebook') return true;
        if (key === 'rootPath') return '';
        if (key === 'notebookConfigPath') return '${notebookPath}.config.json';
        return defaultValue;
      }),
      update: jest.fn()
    }));

    const markdownWithFrontMatter = `---
mode: "agent"
model: Claude Sonnet 4
description: "Test Front Matter visibility"
---

# Main Content

This is the main content.`;

    const cells = codebook.parseMarkdown(markdownWithFrontMatter);

    // Should have 2 cells: Front Matter (YAML) and main content (markdown)
    expect(cells).toHaveLength(2);

    // First cell should be the Front Matter as YAML
    expect(cells[0].kind).toBe(1); // NotebookCellKind.Markup
    expect(cells[0].language).toBe('yaml');
    expect(cells[0].content).toBe('mode: "agent"\nmodel: Claude Sonnet 4\ndescription: "Test Front Matter visibility"');

    // Second cell should be the main content
    expect(cells[1].kind).toBe(1); // NotebookCellKind.Markup
    expect(cells[1].language).toBe('markdown');
    expect(cells[1].content).toBe('# Main Content\n\nThis is the main content.');
  });
});
