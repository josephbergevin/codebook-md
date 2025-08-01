# Copilot Instructions for CodebookMD

This document contains instructions and preferences for GitHub Copilot when working with the CodebookMD codebase. These instructions help maintain consistency and follow established patterns.

## Project Overview

This project (or this workspace) is CodebookMD. CodebookMD is a VS Code extension that brings Jupyter-like notebook functionality to markdown files, allowing code execution and interactive documentation. The extension supports multiple languages and follows a modular architecture - but the core language support is implemented in TypeScript. The extension uses webviews for rendering interactive content and communicates with the VS Code API for various functionalities.

**Key Features**: CodebookMD includes a chat participant feature (@codebook in VS Code chat), multi-language code execution with output capturing, dynamic folder organization in the sidebar, and automatic integration with VS Code's markdown extension ecosystem.

## Architecture Overview

### Core Components Flow

1. **Kernel** (`src/kernel.ts`) - Central execution engine that processes notebook cells
2. **Language Implementations** (`src/languages/`) - Each language has its own Cell class implementing ExecutableCell interface
3. **Command Execution** (`src/codebook.ts`) - Manages spawning processes and capturing output with special markers (StartOutput/EndOutput)
4. **Webview Providers** (`src/webview/`) - Handle sidebar panels (Welcome, Documentation, My Notebooks)
5. **Configuration System** - Supports workspace, user, and per-cell configuration via CellContentConfig

### Critical Data Flow Patterns

- Notebook cells → Kernel → Language-specific Cell class → Command execution → Output capture
- Configuration: VS Code settings → CellContentConfig → OutputConfig → per-language config objects
- File organization: `.vscode/codebook-md.json` → FolderGroup system → webview display

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

### Configuration System Architecture

#### Multi-Level Configuration Hierarchy

1. **VS Code Settings** (`package.json` contributes.configuration)
2. **CellContentConfig** - Per-notebook configuration layer
3. **OutputConfig** - Controls execution output behavior
4. **Language-specific configs** - E.g., `codebook-md.go.execType`

#### Key Configuration Patterns

- Use `config.getFullPath()` for path resolution across workspace/relative paths
- Configuration file: `.vscode/codebook-md.json` for folder organization
- Environment variables: Access `terminal.integrated.env.*` settings via VS Code API
- Per-cell config: Comments like `# [>].output.showTimestamp(true)` in code blocks

### Notebook Organization System

#### FolderGroup Architecture

- **Static Folders**: User-defined in `.vscode/codebook-md.json`
- **Dynamic Folder Groups**: Auto-generated based on current file context
- **Entity Management**: Use `FolderGroupEntity` class for move/delete operations
- **Path Resolution**: Always use `config.getFullPath()` for workspace-relative paths

#### Tree View Operations

- Commands use 1-based groupIndex from webview, convert to 0-based for array access
- Entity IDs encode group/folder/file hierarchy for webview operations
- Refresh pattern: Call `refreshNotebooksView()` after structural changes

## Language Support Implementation

### ExecutableCell Interface Pattern

All language implementations must follow this contract in `src/languages/*.ts`:

```typescript
interface ExecutableCell {
  execute(): ChildProcessWithoutNullStreams;
  executables(): Executable[];
  allowKeepOutput(): boolean;
  codeBlockConfig(): CodeBlockConfig;
  toString(): string;
  commentPrefixes(): string[];
  defaultCommentPrefix(): string;
}
```

### Language-Specific Cell Classes

- Each language has a `Cell` class in `src/languages/[language].ts`
- Language cells parse code content and handle execution context (e.g., Go's main vs test execution modes)
- Use `codebook.Command` class for shell execution with `beforeExecuteFuncs` for setup
- Example: Go supports both `go run` and `go test` modes based on configuration

### Output Capturing System

- Use `codebook.StartOutput` and `codebook.EndOutput` markers for controlled output capture
- Go language requires these markers; shell scripts capture all output by default
- Real-time output streaming via stdout/stderr event handlers in kernel.executeCell

## Critical Developer Workflows

### Build & Test Commands (Use VS Code Tasks, Not Terminal)

- **Build**: Use task `npm run compile` (not manual terminal)
- **Lint**: Use task `npm run lint` (check errors in Problems panel with `get_errors` tool)
- **Test**: Use task `npm test` (all tests must pass)
- **Watch mode**: Use task `npm: watch` for development
- Access task output via Problems panel, not terminal output

### Extension Development Patterns

- **Command Registration**: Register in both `extension.ts` activate() AND `package.json` contributes.commands
- **Webview Lifecycle**: Always implement dispose() methods, use `context.subscriptions.push()`
- **Configuration Access**: Use `workspace.getConfiguration('codebook-md.[section]')` pattern

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