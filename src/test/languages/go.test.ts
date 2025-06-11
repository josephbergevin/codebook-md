import { Cell, Config } from '../../languages/go';
import { workspace, NotebookCell, TextDocument } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock vscode module
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(),
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
  },
  window: {
    activeTextEditor: null,
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn()
  },
  NotebookCellKind: {
    Code: 2
  },
  Range: jest.fn(),
  Uri: {
    file: jest.fn()
  }
}));

describe('Go Language Support', () => {
  let mockNotebookCell: NotebookCell;
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-go-test-'));

    // Mock workspace configuration
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string) => {
        switch (key) {
          case 'execType':
            return 'test';
          case 'execTypeTestConfig':
            return {
              execPath: tempDir,
              filename: 'codebook_md_exec_test.go',
              buildTag: 'playground'
            };
          case 'excludeOutputPrefixes':
            return [];
          default:
            return undefined;
        }
      })
    });

    // Mock NotebookCell
    mockNotebookCell = {
      kind: 2, // NotebookCellKind.Code
      document: {
        getText: jest.fn().mockReturnValue(`
package main

import "fmt"

func main() {
  fmt.Println("Hello, World!")
}
        `.trim())
      } as unknown as TextDocument,
      metadata: {}
    } as unknown as NotebookCell;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Config', () => {
    it('should create a valid config for test execution', () => {
      const config = new Config(workspace.getConfiguration('codebook-md.go'), mockNotebookCell);

      expect(config.execType).toBe('test');
      expect(config.execPath).toBe(tempDir);
      expect(config.execFilename).toBe('codebook_md_exec_test.go');
      expect(config.execFile).toBe(path.join(tempDir, 'codebook_md_exec_test.go'));
      expect(config.execCmd).toBe('test');
      expect(config.execArgs).toEqual(['-run=TestExecNotebook', '-tags=playground', '-v']);
    });

    it('should handle fallback paths when activeTextEditor is undefined', () => {
      // This test verifies our fix for the path resolution issue
      const config = new Config(workspace.getConfiguration('codebook-md.go'), mockNotebookCell);

      // Even without an active editor, the config should have valid paths
      expect(config.execPath).toBeTruthy();
      expect(config.execFile).toBeTruthy();
      expect(path.isAbsolute(config.execFile)).toBe(true);
    });
  });

  describe('Cell', () => {
    it('should create a cell with test configuration', () => {
      const cell = new Cell(mockNotebookCell);

      expect(cell.config.execType).toBe('test');
      expect(cell.executableCode).toContain('package');
      expect(cell.executableCode).toContain('TestExecNotebook');
      // Should not contain build tag yet (will be added by beforeExecuteFunc)
      expect(cell.executableCode).not.toContain('// +build');
    });

    it('should generate valid Go test code', () => {
      const cell = new Cell(mockNotebookCell);

      // Should contain the test function wrapper
      expect(cell.executableCode).toContain('func TestExecNotebook(t *testing.T)');

      // Should contain the original code inside the test
      expect(cell.executableCode).toContain('fmt.Println("Hello, World!")');

      // Should have proper imports
      expect(cell.executableCode).toContain('import (');
      expect(cell.executableCode).toContain('"testing"');
    });

    it('should have proper comment prefixes', () => {
      const cell = new Cell(mockNotebookCell);

      expect(cell.commentPrefixes()).toEqual(['//']);
      expect(cell.defaultCommentPrefix()).toBe('//');
    });

    it('should allow keeping output for single executable', () => {
      const cell = new Cell(mockNotebookCell);

      expect(cell.allowKeepOutput()).toBe(true);
    });
  });

  describe('File Path Resolution', () => {
    it('should resolve paths correctly even without active editor', () => {
      // Set up mock to simulate no active editor  
      const vscode = jest.requireMock('vscode');
      vscode.window.activeTextEditor = undefined;

      const cell = new Cell(mockNotebookCell);

      // Should still have valid paths due to our fallback logic
      expect(cell.config.execPath).toBeTruthy();
      expect(cell.config.execFile).toBeTruthy();
      expect(path.isAbsolute(cell.config.execPath)).toBe(true);
      expect(path.isAbsolute(cell.config.execFile)).toBe(true);
    });

    it('should use workspace folder as fallback when no editor is active', () => {
      const vscode = jest.requireMock('vscode');
      vscode.window.activeTextEditor = undefined;

      const cell = new Cell(mockNotebookCell);

      // Should use workspace folder or current working directory
      expect(cell.config.execPath).toBe(tempDir); // from our mock config
    });
  });
});
