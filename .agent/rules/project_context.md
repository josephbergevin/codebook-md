# Project Context

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
