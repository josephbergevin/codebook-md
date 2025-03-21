import * as config from '../config';

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

  it('fullTempPath with relative folder', () => {
    const tempPath = './temp';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullTempPath(tempPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/temp');
  });

  it('fullTempPath with empty tempPath', () => {
    const tempPath = '';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullTempPath(tempPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md');
  });

  describe('suggestedDisplayName', () => {
    it('should properly format filenames', () => {
      const testCases = [
        {
          input: 'hello-world.md',
          expected: 'Hello World'
        },
        {
          input: 'snake_case_file.md',
          expected: 'Snake Case File'
        },
        {
          input: 'multiple.dots.in.filename.md',
          expected: 'Multiple Dots In Filename'
        },
        {
          input: 'Mixed-case_and.separators.md',
          expected: 'Mixed Case And Separators'
        },
        {
          input: 'alreadyPascalCase.md',
          expected: 'Already Pascal Case'
        }
      ];

      for (const testCase of testCases) {
        expect(config.suggestedDisplayName(testCase.input)).toBe(testCase.expected);
      }
    });
  });
});
