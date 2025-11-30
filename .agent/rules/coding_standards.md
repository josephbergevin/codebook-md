# Coding Standards

## TypeScript/JavaScript

- Use interfaces for type definitions instead of type aliases
- Follow strict TypeScript patterns with explicit typing
- Use async/await pattern for asynchronous operations
- Prefer const over let when variables won't be reassigned
- Use meaningful descriptive names for functions and variables
- Comments should be added for complex logic or non-obvious functionality
- Ensure all code adheres to the established coding standards and practices

## Code Organization

- Place language-specific implementations in src/languages/
- Place webview-related code in src/webview/
- Keep HTML templates in src/webview/templates/
- Use shared utilities from src/io.ts and src/fmt.ts

## Error Handling

- Use try/catch blocks for error-prone operations
- Provide meaningful error messages to users
- Log errors to console for debugging
- Handle VS Code API errors gracefully
- Include proper type checking for undefined/null values

## Security Practices

- Sanitize user input before execution
- Validate file paths and URLs
- Use proper escaping for HTML content
- Follow secure coding practices
- Handle sensitive data appropriately

## Performance Considerations

- Avoid unnecessary file system operations
- Use proper disposal of resources
- Implement lazy loading where appropriate
- Cache frequently accessed data
- Use efficient data structures and algorithms
