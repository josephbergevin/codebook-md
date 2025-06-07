import * as markdownContributions from '../markdownContributions';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode', () => ({
  extensions: {
    all: [
      {
        id: 'test.markdown-extension',
        packageJSON: {
          contributes: {
            'markdown.previewStyles': ['./style.css'],
            'markdown.previewScripts': ['./script.js'],
            'markdown.markdownItPlugins': true
          }
        },
        extensionUri: {
          toString: () => 'file:///test/extension/path'
        },
        isActive: true,
        exports: {
          extendMarkdownIt: jest.fn((md) => md)
        }
      }
    ]
  },
  Uri: {
    joinPath: jest.fn((base, ...segments) => ({
      toString: () => `${base.toString()}/${segments.join('/')}`
    }))
  }
}));

describe('Markdown Contributions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('collectMarkdownContributions', () => {
    it('should collect markdown contribution points from extensions', () => {
      const contributions = markdownContributions.collectMarkdownContributions();

      expect(contributions.styles).toHaveLength(1);
      expect(contributions.scripts).toHaveLength(1);
      expect(contributions.plugins).toHaveLength(1);
    });

    it('should handle extensions without contributions', () => {
      // Override the mock to include an extension without contributions
      const mockExtensions = [
        {
          id: 'test.no-contributions',
          packageJSON: {},
          extensionUri: { toString: () => 'file:///test/path' },
          isActive: true,
          exports: undefined
        }
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.extensions as any).all = mockExtensions;

      const contributions = markdownContributions.collectMarkdownContributions();

      expect(contributions.styles).toHaveLength(0);
      expect(contributions.scripts).toHaveLength(0);
      expect(contributions.plugins).toHaveLength(0);
    });
  });

  describe('createMarkdownItWithPlugins', () => {
    beforeEach(() => {
      // Mock require to return a markdown-it constructor
      const mockMarkdownIt = jest.fn(() => ({
        render: jest.fn((content) => `<p>${content}</p>`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        use: jest.fn(function (this: any, plugin) {
          if (typeof plugin === 'function') {
            plugin(this);
          }
          return this;
        })
      }));

      // Override require
      jest.doMock('markdown-it', () => mockMarkdownIt, { virtual: true });
    });

    it('should create markdown-it instance with default options', () => {
      const md = markdownContributions.createMarkdownItWithPlugins();
      expect(md).not.toBeNull();
    });

    it('should handle missing markdown-it dependency gracefully', () => {
      // Mock require to throw an error
      jest.doMock('markdown-it', () => {
        throw new Error('Module not found');
      }, { virtual: true });

      const md = markdownContributions.createMarkdownItWithPlugins();
      expect(md).toBeNull();
    });
  });

  describe('renderMarkdownWithContributions', () => {
    it('should render markdown content when markdown-it is available', () => {
      const mockMd = {
        render: jest.fn((content) => `<p>${content}</p>`),
        use: jest.fn()
      };

      jest.spyOn(markdownContributions, 'createMarkdownItWithPlugins').mockReturnValue(mockMd as unknown as markdownContributions.MarkdownItInstance);

      const result = markdownContributions.renderMarkdownWithContributions('# Test');
      expect(result).toBe('<p># Test</p>');
      expect(mockMd.render).toHaveBeenCalledWith('# Test');
    });

    it('should return original content when markdown-it is not available', () => {
      jest.spyOn(markdownContributions, 'createMarkdownItWithPlugins').mockReturnValue(null);

      const content = '# Test';
      const result = markdownContributions.renderMarkdownWithContributions(content);
      expect(result).toBe(content);
    });
  });

  describe('extendMarkdownIt', () => {
    it('should return the markdown-it instance unchanged', () => {
      const mockMd = {
        render: jest.fn(),
        use: jest.fn()
      } as markdownContributions.MarkdownItInstance;

      const result = markdownContributions.extendMarkdownIt(mockMd);
      expect(result).toBe(mockMd);
    });
  });

  describe('createMarkdownHtmlWithContributions', () => {
    beforeEach(() => {
      jest.spyOn(markdownContributions, 'renderMarkdownWithContributions').mockReturnValue('<p>Test content</p>');
    });

    it('should create HTML with all contribution points included', () => {
      const html = markdownContributions.createMarkdownHtmlWithContributions('# Test');

      expect(html).toContain('<p>Test content</p>');
      expect(html).toContain('<link rel="stylesheet"');
      expect(html).toContain('<script src=');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should handle webview URI conversion', () => {
      const mockWebview = {
        asWebviewUri: jest.fn((uri) => ({ toString: () => `webview://${uri.toString()}` }))
      };

      const html = markdownContributions.createMarkdownHtmlWithContributions('# Test', mockWebview as unknown as vscode.Webview);

      expect(html).toContain('webview://');
      expect(mockWebview.asWebviewUri).toHaveBeenCalled();
    });
  });
});
