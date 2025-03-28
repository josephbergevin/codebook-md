# Changelog

All notable changes to the Codebook MD extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.9] - 2024-07-20

### Added

- The configuration for the My Notebooks view is now stored in `.vscode/codebook-md.json` for better project-specific customization and portability.

## [0.12.1] - 2024-07-15

### Fixed

- Patch fix for WebViews to resolve rendering issues in certain environments
- Improved stability and performance of WebView-based Activity Bar interface

## [0.12.0] - 2024-07-01

### Added

- CodeBlock configuration options for customizing code execution environments
- New settings for specifying default interpreters for different languages
- Enhanced error handling and reporting for code block execution
- Support for environment variables in code block execution

### Changed

- Improved UI for configuring code block settings
- Enhanced documentation for CodeBlock configuration options

## [0.11.2] - 2024-06-02

### Added

- Move Up/Down functionality for folders and files in My Notebooks view
- Visual indicators for reordering items in the tree view

### Changed

- Enhanced tree view interaction with persistent item ordering
- Improved settings.json synchronization for tree view changes

## [0.11.1] - 2024-06-01

### Added

- New "Welcome" section in the Activity Bar with introduction and usage guide
- Enhanced documentation for Virtual Folders feature directly in the UI

### Changed

- Replaced Tree View implementation with a WebView-based Activity Bar interface
- Improved UI for notebook organization with more intuitive controls
- Better visual hierarchy for folders and files in the My Notebooks view

## [0.10.2] - 2024-03-14

### Fixed

- Fixed sequential shell command execution to prevent race conditions (e.g. brew update/upgrade)
- Improved real-time command output display
- Fixed premature command completion reporting

## [0.10.1] - 2024-03-14

### Fixed

- Fixed workspace path resolution for shell commands when using ${workspaceFolder} variable
- Fixed intermittent code block execution failures
- Fixed long-running shell command output interruption
- Fixed "go.mod not found" errors by properly handling Go workspace paths

## [0.10.0] - 2024-03-14

### Added

- Shell/Bash command execution from workspace root by default
- Better handling of workspace and configuration paths

## [0.9.0] - 2024-03-13

### Added

- Tree View feature for organizing markdown files
- File link hover preview functionality
- Custom settings support for workspace, user, and folder-level configurations

## [0.8.0] - 2024

### Added

- Support for executing code blocks in multiple languages
- Output configuration options for code execution results
- Language support for:
  - Golang
  - Shell/Bash
  - JavaScript
  - TypeScript
  - SQL

## [0.7.5] - 2024

### Fixed

- Various bug fixes and performance improvements

## [0.1.0] - 2024

### Added

- Initial implementation of code block execution
- Basic markdown file support
- Core extension functionality

## [0.0.1-0.0.3] - 2024

### Added

- Initial extension setup
- Basic project structure
- Development environment configuration