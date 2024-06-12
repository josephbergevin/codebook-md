![Codebook MD Logo](extension/src/img/logo.jpeg)

# Codebook MD

Bring your markdown to life with this VS Code extension! Execute code blocks and navigate to internal permalinks all in your local environment. Inspired by Jupyter notebooks, and a furious ongoing battle against boring documentation and markdown files.

## Features

### Executable code blocks

Execute code blocks in markdown files by pressing the corresponding Play button at the top of the code block.

- Languages to be supported:

  - Golang
    - Executed from a main.go file.
    - Executed from within a package as a \_test.go file.
  - Shell/Bash
    - Executed from a .sh file.
  - JavaScript
    - Executed from a .js file.
  - TypeScript
    - Executed from a .ts file.

- Languages to be supported with an accompanying extension:
  - MySQL
    - Executed using the MySQL extension.
  - HTTP
    - Executed using the REST Client extension.

### Custom Settings

Support for workspace, user, and folder-level configurations

### File Link Hover

File links detected in markdown code blocks can be hovered over to view the contents of the file.

- Line Numbers: If a line number is specified, the file will be previewed at that line.
- Line Range: If a line range is specified, the file will be previewed from the start line to the end line.

### Output Configuration

Output from executed code blocks can be configured in the following ways:

- Below the code block
- In the output panel at the bottom of the editor (coming soon)
- In a new tab (coming soon)
- In a file location specified in the settings (coming soon)
