import * as folders from '../folders';

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
        expect(folders.suggestedDisplayName(testCase.input)).toBe(testCase.expected);
      }
    });
  });
});
