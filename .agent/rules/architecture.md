# Architecture Rules

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

## Configuration System Architecture

### Multi-Level Configuration Hierarchy

1. **VS Code Settings** (`package.json` contributes.configuration)
2. **CellContentConfig** - Per-notebook configuration layer
3. **OutputConfig** - Controls execution output behavior
4. **Language-specific configs** - E.g., `codebook-md.go.execType`

### Key Configuration Patterns

- Use `config.getFullPath()` for path resolution across workspace/relative paths
- Configuration file: `.vscode/codebook-md.json` for folder organization
- Environment variables: Access `terminal.integrated.env.*` settings via VS Code API
- Per-cell config: Comments like `# [>].output.showTimestamp(true)` in code blocks

### VS Code Settings UI Configuration Tip

**To ensure a setting appears in the VS Code Settings UI, define it as a flat property in `package.json` (not nested in an object).**

If you nest settings inside an object (e.g., `"codebook-md.frontMatter": { ... }`), they will not be user-configurable in the UI. Always use the flat property format for user-facing settings.

## Notebook Organization System

### FolderGroup Architecture

- **Static Folders**: User-defined in `.vscode/codebook-md.json`
- **Dynamic Folder Groups**: Auto-generated based on current file context
- **Entity Management**: Use `FolderGroupEntity` class for move/delete operations
- **Path Resolution**: Always use `config.getFullPath()` for workspace-relative paths

### Tree View Operations

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

## VS Code Integration

- Use VS Code's built-in APIs when available
- Follow VS Code's extension guidelines
- Support proper extension activation events
- Handle extension lifecycle events properly
- Use VS Code's native UI components when possible
- Implement chat participants using VS Code's chat API for enhanced user interaction
- Ensure chat participants are properly registered with appropriate metadata
