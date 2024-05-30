# Codebook MD

Bring your markdown to life with this VS Code extension! Execute code blocks and navigate to internal permalinks all in your local environment. Inspired by Jupyter notebooks, and a furious ongoing battle against boring documentation and markdown files.


## Features (coming soon)

### Executable code blocks

Execute code blocks in markdown files by pressing the corresponding Play button at the top of the code block.

- Languages currently supported:
  - Golang
    - Executed from a main.go file.
    - Executed from within a package as a _test.go file.
  - Shell/Bash
    - Executed from a .sh file.
  - JavaScript
    - Executed from a .js file.
  - TypeScript
    - Executed from a .ts file.

- Languages currently supported with an accompanying extension:
  - MySQL
    - Executed using the MySQL extension.
  - HTTP
    - Executed using the REST Client extension.

### Custom Settings

Support for workspace, user, and folder-level configurations

### Permalinks
Permalinks in markdown that point to the current repository or workspace work as they do in GitHub, only locally.

### Output Configuration
Output from executed code blocks can be configured in the following ways:
- In the output panel at the bottom of the editor
- In a new tab
- In a file location specified in the settings
