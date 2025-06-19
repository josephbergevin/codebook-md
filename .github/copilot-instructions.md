# Copilot Instructions for CodebookMD

This document contains instructions and preferences for GitHub Copilot when working with the CodebookMD codebase. These instructions help maintain consistency and follow established patterns.

## Project Overview

This project (or this workspace) is CodebookMD. CodebookMD is a VS Code extension that brings Jupyter-like notebook functionality to markdown files, allowing code execution and interactive documentation. The extension supports multiple languages and follows a modular architecture - but the core language support is implemented in TypeScript. The extension uses webviews for rendering interactive content and communicates with the VS Code API for various functionalities.

**New in this version**: CodebookMD now includes a chat participant feature that allows users to interact with an AI assistant directly within VS Code to get help with notebook management, code execution, and configuration. The chat participant is accessible through the "@codebook" mention in VS Code chat.

## Project Reference

- When the user is interacting with Copilot, this project can be referred to in any of the following ways:
  - CodebookMD
  - This extension
  - The CodebookMD extension
  - This project
  - This workspace
  - The CodebookMD codebase

## Code Conventions

### TypeScript/JavaScript

- Use interfaces for type definitions instead of type aliases
- Follow strict TypeScript patterns with explicit typing
- Use async/await pattern for asynchronous operations
- Prefer const over let when variables won't be reassigned
- Use meaningful descriptive names for functions and variables
- Comments should be added for complex logic or non-obvious functionality
- Ensure all code adheres to the established coding standards and practices

#### Code Quality Checks:

- Code Quality checks should be run from the VS Code task runner, not manually in the terminal. After running the task, any failures will be output to the #problems panel. You can use the `get_errors` tool to see the results of the check that was run.
- Ensure all generated code passes the following checks (only to be run as tasks, not manually in the terminal, if possible):
  - `npm run compile` for building the extension
  - `npm install` for installing dependencies
  - `npm run lint` for linting
  - `npm test` for unit tests - all tests should pass

### Testing

- Test files should mirror the structure of their implementation files
  - Test Folder Location: `#file: ../src/test/`
  - Test File Naming: <filename>.test.ts
    - For example, if the implementation file is `src/languages/codebook.ts`, the test file should be `#file:../src/test/languages/codebook.test.ts`
  - Tests are written in TypeScript
  - Test files should mirror the structure of their implementation files
- Use Jest for unit testing
- Each test should focus on a single piece of functionality
- Use descriptive test names that explain the scenario being tested
- Mock VS Code APIs using jest.mock
- Organize tests using describe blocks for logical grouping
- Include tests for both success and error cases
- When fixing a failing test, use the task 'npm test' (vscode task or cli) to run all tests

### Code Organization

- Place language-specific implementations in src/languages/
- Place webview-related code in src/webview/
- Keep HTML templates in src/webview/templates/
- Use shared utilities from src/io.ts and src/fmt.ts

## Extension Patterns

### Webview Implementation

- Use VS Code's webview API for UI components
- Follow the established provider pattern for webviews
  - A webview should have 2 files:
    - A provider View file (e.g., src/webview/documentationView.ts)
      - This file should implement the WebviewViewProvider interface
      - It should handle the creation and management of the webview
      - Use the Webview API to create and manage the webview content
      - Implement the resolveWebviewView method to provide the webview content
      - Use the Webview API to handle messages from the webview
    - A webview html templated file (e.g., src/webview/templates/documentation.html)
      - This file should be in the src/webview/templates/ directory
      - Include all necessary HTML, CSS, and JavaScript in this file
      - Use the webview API to load the HTML file
- Handle message passing between webview and extension host
- Use VS Code's styling variables for theming consistency
- Implement proper cleanup in dispose() methods

### Chat Participant Implementation

- The chat participant is implemented using VS Code's ChatRequestHandler interface
- The participant ID is 'codebook-md' and can be invoked with '@codebook' in VS Code chat
- The chat handler provides context-aware responses about:
  - Creating and managing notebooks
  - Executing code in various languages
  - Configuring extension settings
  - General usage questions
- Follow-up suggestions are provided based on the user's query type
- Include proper error handling and user-friendly responses
- Register the chat participant in the extension's activate function
- Set an appropriate icon path for the chat participant

### Command Registration

- Register commands in extension.ts activate function
- Commands must also be registered in the package.json file
- Use meaningful command names prefixed with 'codebook-md.'
- Include command error handling and user feedback
- Properly dispose of unused command registrations
- Ensure command registrations are updated when new commands are added
- Ensure command names are consistent with the established naming conventions

### Configuration

- Use CellContentConfig for code block configurations
- Support language-specific comment syntax
- Follow the established pattern for notebook output configurations:
  - showExecutableCodeInOutput
  - showOutputOnRun
  - replaceOutputCell
  - showTimestamp
  - timestampTimezone

### Language Support

- Implement new language support in src/languages/
- Follow the ExecutableCell interface contract
- Include proper error handling for missing language tools
- Support language-specific comment syntax
- Implement proper command execution and output handling

## Error Handling

- Use try/catch blocks for error-prone operations
- Provide meaningful error messages to users
- Log errors to console for debugging
- Handle VS Code API errors gracefully
- Include proper type checking for undefined/null values

## Documentation

- Add JSDoc comments for public functions and classes
- Include parameter descriptions and return types
- Document complex logic or algorithms
- Document breaking changes in CHANGELOG.md
- Keep the documentation.html and README.md files updated with new features and changes
  - Add user-facing documentation for new features and commands
  - Where possible, include examples of usage
  - Update the index of the documentation.html file to include new features as well

## Git and Version Control

- Use descriptive commit messages that explain the changes made
- Maximum 72 characters per line in commit messages
- Follow this commit message format:
  - First Line: `<type>(<scope>): <subject>`
  - Additional Lines: `<body>`
- Use the following types:
  - feat: A new feature
  - fix: A bug fix
  - docs: Documentation changes
  - style: Changes that don't affect the meaning of the code (white-space, formatting, tabs vs spaces, etc)
  - refactor: A code change that neither fixes a bug nor adds a feature
  - perf: A code change that improves performance
  - test: Adding or updating tests
  - build: Changes that affect the build system or external dependencies
  - ci: Changes to our CI configuration files and scripts
  - tooling: Changes to the build process or auxiliary tools and libraries such as documentation generation

## VS Code Integration

- Use VS Code's built-in APIs when available
- Follow VS Code's extension guidelines
- Support proper extension activation events
- Handle extension lifecycle events properly
- Use VS Code's native UI components when possible
- Implement chat participants using VS Code's chat API for enhanced user interaction
- Ensure chat participants are properly registered with appropriate metadata

## Performance Considerations

- Avoid unnecessary file system operations
- Use proper disposal of resources
- Implement lazy loading where appropriate
- Cache frequently accessed data
- Use efficient data structures and algorithms

## Security Practices

- Sanitize user input before execution
- Validate file paths and URLs
- Use proper escaping for HTML content
- Follow secure coding practices
- Handle sensitive data appropriately

Remember these instructions when suggesting changes or implementing new features in the CodebookMD codebase.