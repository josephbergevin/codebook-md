# Workflows

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

## Documentation

- Add JSDoc comments for public functions and classes
- Include parameter descriptions and return types
- Document complex logic or algorithms
- Document breaking changes in CHANGELOG.md
- Keep the documentation.html and README.md files updated with new features and changes
  - Add user-facing documentation for new features and commands
  - Where possible, include examples of usage
  - Update the index of the documentation.html file to include new features as well
