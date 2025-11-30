# Testing Guidelines

## Structure and Naming

- Test files should mirror the structure of their implementation files
  - Test Folder Location: `#file: ../src/test/`
  - Test File Naming: <filename>.test.ts
    - For example, if the implementation file is `src/languages/codebook.ts`, the test file should be `#file:../src/test/languages/codebook.test.ts`
  - Tests are written in TypeScript
  - Test files should mirror the structure of their implementation files

## Jest Usage

- Use Jest for unit testing
- Each test should focus on a single piece of functionality
- Use descriptive test names that explain the scenario being tested
- Mock VS Code APIs using jest.mock
- Organize tests using describe blocks for logical grouping
- Include tests for both success and error cases
- When fixing a failing test, use the task 'npm test' (vscode task or cli) to run all tests
