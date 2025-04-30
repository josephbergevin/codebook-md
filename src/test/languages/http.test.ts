import * as vscode from 'vscode';
import { Cell } from '../../languages/http';

// Mock the fs module to prevent actual file operations
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn()
}));

// Mock the CodeBlockConfig class and needed dependencies
jest.mock('../../codebook', () => {
  return {
    CodeBlockConfig: jest.fn().mockImplementation((cell) => {
      // Use the cell's content for innerScope
      return {
        innerScope: cell.document.getText(),
        commands: [],
        availableCommands: jest.fn().mockReturnValue([]),
        languageId: 'http',
        jsonStringify: jest.fn().mockReturnValue('{}')
      };
    }),
    Command: jest.fn().mockImplementation(() => {
      return {
        execute: jest.fn(),
        addBeforeExecuteFunc: jest.fn(),
        setCommandToDisplay: jest.fn()
      };
    }),
    Executable: class {
      constructor() { }
    },
    Language: class {
      constructor() { }
    }
  };
});

// Mock specific VS Code functions
jest.mock('vscode', () => {
  const mockConfig = (configName: string) => {
    // Different configuration objects for different config paths
    if (configName === 'codebook-md.http') {
      return {
        get: (key: string) => {
          switch (key) {
            case 'execCmd': return 'curl';
            case 'execFilename': return 'test_http.sh';
            case 'verbose': return true;
            default: return undefined;
          }
        }
      };
    } else if (configName === 'codebook-md.http.output') {
      return {
        get: (key: string) => {
          switch (key) {
            case 'showExecutableCodeInOutput': return true;
            case 'showOutputOnRun': return true;
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
      getConfiguration: jest.fn().mockImplementation(mockConfig)
    }
  };
});

// Mock config module to avoid file system operations
jest.mock('../../config', () => ({
  getTempPath: jest.fn().mockReturnValue('/test/path')
}));

// Mock the io module
jest.mock('../../io', () => ({
  writeDirAndFileSyncSafe: jest.fn(),
  commandNotOnPath: jest.fn().mockReturnValue(false)
}));

// Create a mock NotebookCell with GET request
const createMockNotebookCell = (content: string) => ({
  document: {
    languageId: 'http',
    getText: () => content,
    uri: { fsPath: 'test.md' }
  },
  metadata: {
    custom: {}
  }
} as unknown as vscode.NotebookCell);

// Default mock cell
const mockNotebookCell = createMockNotebookCell('GET https://example.com');

describe('HTTP Language Support', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  test('Cell constructor should parse HTTP GET request correctly', () => {
    const cell = new Cell(mockNotebookCell);
    expect(cell.executableCode).toContain('curl -X GET "https://example.com"');
  });

  test('Cell constructor should handle HTTP POST request with headers and body', () => {
    const postContent = `POST https://api.example.com/data
Content-Type: application/json
Authorization: Bearer test-token

{
  "name": "test",
  "value": 123
}`;
    const postCell = createMockNotebookCell(postContent);

    const cell = new Cell(postCell);
    expect(cell.executableCode).toContain('curl -X POST "https://api.example.com/data"');
    expect(cell.executableCode).toContain('-H "Content-Type: application/json"');
    expect(cell.executableCode).toContain('-H "Authorization: Bearer test-token"');
  });

  test('Cell constructor should handle comments in HTTP requests', () => {
    const commentContent = `# This is a comment
GET https://example.com
# Another comment`;
    const commentCell = createMockNotebookCell(commentContent);

    const cell = new Cell(commentCell);
    expect(cell.executableCode).toContain('curl -X GET "https://example.com"');
    expect(cell.executableCode).not.toContain('# This is a comment');
    expect(cell.executableCode).not.toContain('# Another comment');
  });

  test('Cell should use default comment prefix of #', () => {
    const cell = new Cell(mockNotebookCell);
    expect(cell.defaultCommentPrefix()).toBe('#');
  });

  test('Cell should have the correct comment prefixes', () => {
    const cell = new Cell(mockNotebookCell);
    expect(cell.commentPrefixes()).toEqual(['#']);
  });

  test('Cell should allow keeping output', () => {
    const cell = new Cell(mockNotebookCell);
    expect(cell.allowKeepOutput()).toBe(true);
  });

  test('Cell should handle empty requests', () => {
    const emptyCell = createMockNotebookCell('');
    const cell = new Cell(emptyCell);
    // Should default to a simple GET request to example.com
    expect(cell.executableCode).toContain('curl -v "https://example.com"');
  });
});
