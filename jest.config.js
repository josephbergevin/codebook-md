/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
      },
    ],
  },
  // Ignore VS Code test directories to avoid haste module naming collisions
  modulePathIgnorePatterns: [
    '<rootDir>/.vscode-test/',
    '<rootDir>/out/',
  ],
};
