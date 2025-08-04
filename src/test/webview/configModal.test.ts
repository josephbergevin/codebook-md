import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock VS Code API
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createWebviewPanel: jest.fn(),
    showInputBox: jest.fn(),
    showWarningMessage: jest.fn(),
    activeTextEditor: undefined
  },
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn()
    }),
    openNotebookDocument: jest.fn()
  },
  commands: {
    executeCommand: jest.fn()
  },
  env: {
    clipboard: {
      writeText: jest.fn()
    }
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3
  },
  Uri: {
    file: jest.fn().mockImplementation((path: string) => ({ fsPath: path, toString: () => path })),
    parse: jest.fn().mockImplementation((uriString: string) => ({ fsPath: uriString.replace('file://', '') }))
  },
  NotebookCellKind: {
    Markup: 1,
    Code: 2
  }
}));

// Import the module after mocking
import { __test__ } from '../../webview/configModal';

describe('ConfigModal Front Matter Functionality', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configmodal-test-'));
  });

  afterEach(() => {
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('updateFrontMatterInMarkdown', () => {
    test('should add front matter to markdown without existing front matter', () => {
      const content = `# Test Document

This is a test document.`;
      const frontMatter = `mode: agent
model: Claude Sonnet 4
description: Test notebook`;

      const result = __test__.updateFrontMatterInMarkdown(content, frontMatter);

      expect(result).toContain('---');
      expect(result).toContain('mode: agent');
      expect(result).toContain('model: Claude Sonnet 4');
      expect(result).toContain('description: Test notebook');
      expect(result).toContain('# Test Document');
    });

    test('should update existing front matter', () => {
      const content = `---
mode: old_mode
description: Old description
---

# Test Document

This is a test document.`;
      const frontMatter = `mode: agent
model: Claude Sonnet 4
description: Updated description`;

      const result = __test__.updateFrontMatterInMarkdown(content, frontMatter);

      expect(result).toContain('mode: agent');
      expect(result).toContain('model: Claude Sonnet 4');
      expect(result).toContain('description: Updated description');
      expect(result).not.toContain('old_mode');
      expect(result).not.toContain('Old description');
      expect(result).toContain('# Test Document');
    });

    test('should remove front matter when empty string provided', () => {
      const content = `---
mode: agent
description: Test
---

# Test Document

This is a test document.`;

      const result = __test__.updateFrontMatterInMarkdown(content, '');

      expect(result).not.toContain('---');
      expect(result).not.toContain('mode: agent');
      expect(result).toContain('# Test Document');
      expect(result).toContain('This is a test document.');
    });
  });

  describe('extractFrontMatterFromMarkdown', () => {
    test('should extract front matter from markdown', () => {
      const content = `---
mode: agent
model: Claude Sonnet 4
description: Test notebook
---

# Test Document

This is a test document.`;

      const result = __test__.extractFrontMatterFromMarkdown(content);

      expect(result).toBe(`mode: agent
model: Claude Sonnet 4
description: Test notebook`);
    });

    test('should return empty string for markdown without front matter', () => {
      const content = `# Test Document

This is a test document.`;

      const result = __test__.extractFrontMatterFromMarkdown(content);

      expect(result).toBe('');
    });

    test('should return empty string for incomplete front matter', () => {
      const content = `---
mode: agent
model: Claude Sonnet 4

# Test Document (no closing ---)`;

      const result = __test__.extractFrontMatterFromMarkdown(content);

      expect(result).toBe('');
    });
  });
});
