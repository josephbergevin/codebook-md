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
});
