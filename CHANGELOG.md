# Changelog

All notable changes to the Codebook MD extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.1] - 2025-04-21

### Added

- Collapsible folder groups in My Notebooks webview
- Dynamic folder group collapsible functionality for better workspace organization
- Visual indicators for expanded and collapsed states

### Fixed

- Improved interaction with folder group headers
- Better event handling to prevent overlapping click actions
- Enhanced UI responsiveness for notebook organization view

## [0.15.0] - 2025-04-16

### Added

- Enhanced notebook creation functionality with improved templates
- Multiple creation methods: Command Palette, Context Menu, and My Notebooks view
- Creation from selection feature to convert existing code to notebooks
- Comprehensive documentation on notebook creation workflows
- Best practices section for effective notebook organization

### Changed

- Improved notebook template structure with better examples
- Enhanced user interface for notebook creation workflow
- Streamlined process for adding notebooks to My Notebooks view
- Updated documentation with detailed notebook creation instructions

## [0.14.0] - 2025-04-14

### Added

- VS Code environment variables support for shell scripts
- Access to terminal.integrated.env.\* settings in shell code blocks
- Platform-specific environment variables detection (macOS, Windows, Linux)
- Environment variables documentation in built-in documentation view

### Changed

- Improved shell script execution with merged environment variables
- Enhanced output handling for environment-sensitive commands
- Updated documentation with environment variables examples and best practices

## [0.13.3] - 2025-04-01

### Added

- Configuration options for Dynamic Folder Groups in settings.json
- Customizable name and description for dynamic folder groups
- Subfolder inclusion configuration for dynamic folder groups
- Exclusion patterns to filter dynamic folder group content
- Empty folder filtering for cleaner dynamic folder presentation

### Changed

- Enhanced documentation with detailed configuration examples
- Improved folder group creation algorithm for better performance
- Better handling of special folder names (like .github and .vscode)

## [0.13.0] - 2025-03-31

### Added

- Dynamically Generated Folders in My Notebooks View - folders are automatically created based on the currently focused file
- Improved navigation between related markdown files with contextual organization
- Smart file grouping to enhance workflow and documentation discovery

### Changed

- Refined My Notebooks view UI for better visibility of dynamic folder structures
- Enhanced folder generation algorithm for more intuitive file organization

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