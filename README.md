![Codebook MD Logo](extension/src/img/logo_2-1_orig.png)

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
  - SQL
    - Executed using a specified cli client.    

- Languages supported with an accompanying extension:
  - SQL
    - Executed using a SQL extension.
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

## Collaboration

This project is open to collaboration! If you have an idea for a feature, or would like to contribute to the project, please feel free to reach out to me via an [issue](https://github.com/josephbergevin/codebook-md/issues).

## Inspiration

This extension was inspired by the Jupyter notebook, which allows for the execution of code blocks in a notebook environment. The goal of this extension is to bring that functionality to markdown files in VS Code. While some inspiration was also drawn from existing markdown extensions in the VS Code marketplace, I wanted to have the ability to move quicker with adding new features and languages. More specifically, I wanted to implement a way to interact with local files from within the markdown file itself.
- Extensions of Note:
  - [Go Notebook](https://marketplace.visualstudio.com/items?itemName=gobookdev.gobook)
    - Last updated in 2022, no public repository
  - [Codebook](https://marketplace.visualstudio.com/items?itemName=gobookdev.gobook)
    - Last updated in 2022, no public repository
  - [md-notebook](https://marketplace.visualstudio.com/items?itemName=jackos.md-notebook)