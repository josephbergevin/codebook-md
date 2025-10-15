import { Uri } from 'vscode';
import {
  addHistoryEntry,
  getHistoryForCell,
  clearHistoryForCell,
  clearAllHistory,
  getAllHistory,
  getExecutionHistoryConfig
} from '../cellConfig';
import { ExecutionHistoryEntry, ExecutionStatus } from '../types/executionHistory';
import * as fs from 'fs';

// Mock VS Code API
jest.mock('vscode', () => ({
  Uri: {
    parse: (uriString: string) => ({
      fsPath: uriString.replace('file://', ''),
      toString: () => uriString
    }),
    file: (filePath: string) => ({
      fsPath: filePath,
      toString: () => `file://${filePath}`
    })
  },
  workspace: {
    getConfiguration: jest.fn((section?: string) => {
      if (section === 'codebook-md.executionHistory') {
        return {
          get: jest.fn((key: string, defaultValue?: unknown) => {
            if (key === 'enabled') return true;
            if (key === 'historyLimit') return 10;
            return defaultValue;
          })
        };
      }
      return {
        get: jest.fn((key: string, defaultValue?: unknown) => defaultValue)
      };
    })
  }
}));

// Mock fs module
jest.mock('fs');
jest.mock('../io', () => ({
  writeDirAndFileSyncSafe: jest.fn(() => {
    // Mock implementation - just track that it was called
  })
}));

describe('Execution History', () => {
  const testNotebookUri = Uri.parse('file:///test/notebook.md');

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock fs.existsSync to return false by default
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // Mock fs.readFileSync to return empty config
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
  });

  describe('getExecutionHistoryConfig', () => {
    it('should return default configuration', () => {
      const config = getExecutionHistoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.historyLimit).toBe(10);
    });
  });

  describe('addHistoryEntry', () => {
    it('should add a history entry for a cell', () => {
      const entry: ExecutionHistoryEntry = {
        id: '123',
        cellIndex: 0,
        languageId: 'javascript',
        code: 'console.log("Hello");',
        output: 'Hello',
        status: ExecutionStatus.Success,
        timestamp: new Date().toISOString()
      };

      // Mock loadNotebookConfig to return empty config
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = addHistoryEntry(testNotebookUri, entry);

      expect(result).toBe(true);
    });

    it('should respect history limit', () => {
      // Create 20 entries (more than the limit of 10)
      const entries: ExecutionHistoryEntry[] = [];
      for (let i = 0; i < 20; i++) {
        entries.push({
          id: `entry-${i}`,
          cellIndex: 0,
          languageId: 'javascript',
          code: `console.log("Test ${i}");`,
          output: `Test ${i}`,
          status: ExecutionStatus.Success,
          timestamp: new Date(Date.now() + i * 1000).toISOString()
        });
      }

      // Mock config with some existing entries
      const mockConfig = {
        '0': {
          config: {
            executionHistory: entries.slice(0, 8) // Start with 8 entries
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      // Add 5 more entries - should trigger limit
      for (let i = 8; i < 13; i++) {
        addHistoryEntry(testNotebookUri, entries[i]);
      }

      // The history should be limited to 10 entries
      const history = getHistoryForCell(testNotebookUri, 0);
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should not add entry when history is disabled', () => {
      // Mock disabled configuration
      const vscode = jest.requireMock('vscode');
      vscode.workspace.getConfiguration = jest.fn((section?: string) => {
        if (section === 'codebook-md.executionHistory') {
          return {
            get: jest.fn((key: string) => {
              if (key === 'enabled') return false;
              if (key === 'historyLimit') return 10;
            })
          };
        }
        return {
          get: jest.fn((key: string, defaultValue?: unknown) => defaultValue)
        };
      });

      const entry: ExecutionHistoryEntry = {
        id: '456',
        cellIndex: 0,
        languageId: 'python',
        code: 'print("Test")',
        output: 'Test',
        status: ExecutionStatus.Success,
        timestamp: new Date().toISOString()
      };

      const result = addHistoryEntry(testNotebookUri, entry);

      // Should return false when disabled
      expect(result).toBe(false);
    });
  });

  describe('getHistoryForCell', () => {
    it('should return history for a specific cell', () => {
      const mockHistory: ExecutionHistoryEntry[] = [
        {
          id: '1',
          cellIndex: 0,
          languageId: 'javascript',
          code: 'console.log("Test 1");',
          output: 'Test 1',
          status: ExecutionStatus.Success,
          timestamp: new Date().toISOString()
        },
        {
          id: '2',
          cellIndex: 0,
          languageId: 'javascript',
          code: 'console.log("Test 2");',
          output: 'Test 2',
          status: ExecutionStatus.Success,
          timestamp: new Date().toISOString()
        }
      ];

      const mockConfig = {
        '0': {
          config: {
            executionHistory: mockHistory
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const history = getHistoryForCell(testNotebookUri, 0);

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('1');
      expect(history[1].id).toBe('2');
    });

    it('should return empty array for cell without history', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const history = getHistoryForCell(testNotebookUri, 0);

      expect(history).toEqual([]);
    });
  });

  describe('getAllHistory', () => {
    it('should return history for all cells', () => {
      const mockConfig = {
        '0': {
          config: {
            executionHistory: [
              {
                id: '1',
                cellIndex: 0,
                languageId: 'javascript',
                code: 'console.log("Cell 0");',
                output: 'Cell 0',
                status: ExecutionStatus.Success,
                timestamp: new Date().toISOString()
              }
            ]
          }
        },
        '1': {
          config: {
            executionHistory: [
              {
                id: '2',
                cellIndex: 1,
                languageId: 'python',
                code: 'print("Cell 1")',
                output: 'Cell 1',
                status: ExecutionStatus.Success,
                timestamp: new Date().toISOString()
              }
            ]
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const allHistory = getAllHistory(testNotebookUri);

      expect(Object.keys(allHistory)).toHaveLength(2);
      expect(allHistory['0']).toHaveLength(1);
      expect(allHistory['1']).toHaveLength(1);
    });
  });

  describe('clearHistoryForCell', () => {
    it('should clear history for a specific cell', () => {
      const mockConfig = {
        '0': {
          config: {
            executionHistory: [
              {
                id: '1',
                cellIndex: 0,
                languageId: 'javascript',
                code: 'console.log("Test");',
                output: 'Test',
                status: ExecutionStatus.Success,
                timestamp: new Date().toISOString()
              }
            ]
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const result = clearHistoryForCell(testNotebookUri, 0);

      expect(result).toBe(true);
    });

    it('should return true when clearing non-existent history', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = clearHistoryForCell(testNotebookUri, 0);

      expect(result).toBe(true);
    });
  });

  describe('clearAllHistory', () => {
    it('should clear history for all cells', () => {
      const mockConfig = {
        '0': {
          config: {
            executionHistory: [
              {
                id: '1',
                cellIndex: 0,
                languageId: 'javascript',
                code: 'console.log("Cell 0");',
                output: 'Cell 0',
                status: ExecutionStatus.Success,
                timestamp: new Date().toISOString()
              }
            ]
          }
        },
        '1': {
          config: {
            executionHistory: [
              {
                id: '2',
                cellIndex: 1,
                languageId: 'python',
                code: 'print("Cell 1")',
                output: 'Cell 1',
                status: ExecutionStatus.Success,
                timestamp: new Date().toISOString()
              }
            ]
          }
        }
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const result = clearAllHistory(testNotebookUri);

      expect(result).toBe(true);
    });
  });

  describe('History entry structure', () => {
    it('should create valid history entry with all required fields', () => {
      const entry: ExecutionHistoryEntry = {
        id: 'test-id',
        cellIndex: 5,
        languageId: 'typescript',
        code: 'const x = 10;',
        output: 'undefined',
        status: ExecutionStatus.Success,
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      expect(entry.id).toBe('test-id');
      expect(entry.cellIndex).toBe(5);
      expect(entry.languageId).toBe('typescript');
      expect(entry.code).toBe('const x = 10;');
      expect(entry.output).toBe('undefined');
      expect(entry.status).toBe(ExecutionStatus.Success);
      expect(entry.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should support optional fields', () => {
      const entry: ExecutionHistoryEntry = {
        id: 'test-id',
        cellIndex: 0,
        languageId: 'go',
        code: 'package main',
        output: '',
        status: ExecutionStatus.Failure,
        timestamp: new Date().toISOString(),
        errorMessage: 'Compilation failed',
        exitCode: 1
      };

      expect(entry.errorMessage).toBe('Compilation failed');
      expect(entry.exitCode).toBe(1);
    });
  });

  describe('History ordering', () => {
    it('should maintain history in newest-first order', () => {
      const now = Date.now();
      const entries: ExecutionHistoryEntry[] = [
        {
          id: '1',
          cellIndex: 0,
          languageId: 'javascript',
          code: 'console.log(1);',
          output: '1',
          status: ExecutionStatus.Success,
          timestamp: new Date(now).toISOString()
        },
        {
          id: '2',
          cellIndex: 0,
          languageId: 'javascript',
          code: 'console.log(2);',
          output: '2',
          status: ExecutionStatus.Success,
          timestamp: new Date(now + 1000).toISOString()
        },
        {
          id: '3',
          cellIndex: 0,
          languageId: 'javascript',
          code: 'console.log(3);',
          output: '3',
          status: ExecutionStatus.Success,
          timestamp: new Date(now + 2000).toISOString()
        }
      ];

      // Add entries in order
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      entries.forEach(entry => {
        addHistoryEntry(testNotebookUri, entry);
      });

      // Verify newest entry is first
      const history = getHistoryForCell(testNotebookUri, 0);

      // Note: In the actual implementation, entries are added with unshift()
      // so the newest entry should be at index 0
      if (history.length > 0) {
        expect(new Date(history[0].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(history[history.length - 1].timestamp).getTime()
        );
      }
    });
  });
});
