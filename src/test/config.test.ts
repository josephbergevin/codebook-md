import * as config from '../config';
import * as path from 'path';

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

describe('config.ts Test Suite', () => {
  const workspacePath = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';

  it('fullExecPath with relative folder', () => {
    const execPath = './temp';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullExecPath(execPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/temp');
  });

  it('fullExecPath with empty execPath', () => {
    const execPath = '';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullExecPath(execPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md');
  });

  describe('getFullPath', () => {
    it('should handle absolute paths within workspace', () => {
      const filePath = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/docs/example.md';
      const result = config.getFullPath(filePath, workspacePath);
      expect(result).toBe('docs/example.md');
    });

    it('should handle relative paths', () => {
      const filePath = 'docs/example.md';
      const result = config.getFullPath(filePath, workspacePath);
      expect(result).toBe('docs/example.md');
    });

    it('should handle paths with ../..', () => {
      const filePath = '../codebook-md/docs/example.md';
      const expected = path.normalize('docs/example.md');
      const result = config.getFullPath(filePath, workspacePath);
      expect(result).toBe(expected);
    });

    it('should handle absolute paths outside workspace', () => {
      const filePath = '/other/path/example.md';
      const result = config.getFullPath(filePath, workspacePath);
      expect(result).toBe('/other/path/example.md');
    });

    it('should handle empty workspace path', () => {
      const filePath = 'docs/example.md';
      const result = config.getFullPath(filePath, '');
      expect(result).toBe(filePath);
    });

    it('should handle paths with backslashes', () => {
      const filePath = 'docs\\example.md';
      const result = config.getFullPath(filePath, workspacePath);
      expect(result).toBe('docs/example.md');  // Expect forward slashes regardless of input
    });
  });

  describe('isMarkdownPreviewStylingEnabled', () => {
    const getConfiguration = jest.requireMock('vscode').workspace.getConfiguration as jest.Mock;

    it('defaults to on when the setting is not set', () => {
      getConfiguration.mockReturnValueOnce({ get: jest.fn((_key: string, defaultValue: unknown) => defaultValue) });
      expect(config.isMarkdownPreviewStylingEnabled()).toBe(true);
    });

    it('returns off when the setting is off', () => {
      getConfiguration.mockReturnValueOnce({ get: jest.fn(() => false) });
      expect(config.isMarkdownPreviewStylingEnabled()).toBe(false);
    });

    it('reads the codebook-md.markdown.previewStyling key', () => {
      const get = jest.fn(() => true);
      getConfiguration.mockReturnValueOnce({ get });
      config.isMarkdownPreviewStylingEnabled();
      expect(getConfiguration).toHaveBeenLastCalledWith('codebook-md.markdown');
      expect(get).toHaveBeenCalledWith('previewStyling', true);
    });
  });
});
