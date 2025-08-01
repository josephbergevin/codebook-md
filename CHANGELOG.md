# Changelog

All notable changes to the Codebook MD extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.19.7] - 2025-08-01

### Added

- **Front Matter Parsing Support:**
  - Added comprehensive YAML front matter parsing for markdown files
  - Support for agent mode configuration and model specification in front matter
  - Enhanced markdown parsing to handle metadata blocks at the beginning of files
  - Improved notebook cell extraction with front matter awareness

### Fixed

- **Path Resolution Improvements:**
  - Implemented smart relative path resolution for more reliable file operations
  - Fixed import formatting issues in Go run mode for better dependency handling
  - Enhanced path resolution logic to handle workspace-relative and absolute paths correctly
  - Improved file path handling across different execution contexts

### Changed

- **Configuration System Cleanup:**
  - Removed deprecated configuration scopes and cleaned up settings architecture
  - Streamlined configuration hierarchy for better maintainability
  - Updated configuration documentation to reflect current system structure
  - Enhanced configuration validation and error handling

### Technical Implementation

- Enhanced markdown parser to extract and process YAML front matter blocks
- Improved path resolution algorithms with fallback mechanisms
- Cleaned up deprecated configuration references throughout codebase
- Added comprehensive test coverage for new front matter and path resolution features

## [0.19.6] - 2025-06-22

### Added

- **Enhanced Config Modal UI:**
  - Added blue outline to config modal matching VS Code's selected cell styling
  - Implemented sticky header that remains visible when scrolling through configuration options
  - Added language-specific file icons to modal header matching VS Code's file explorer style
  - Comprehensive language icon support for 30+ programming languages with proper color coding
  - Professional styling improvements for better integration with VS Code's UI theme

### Removed

- **Configuration Cleanup:**
  - Removed deprecated `showOutputOnRun` configuration option from all components
  - Cleaned up package.json configuration schemas removing unused output options
  - Removed obsolete test references and documentation for deprecated features
  - Streamlined configuration system for better maintainability

### Changed

- **Improved User Experience:**
  - Config modal now has visual consistency with VS Code's focus styling using `--vscode-focusBorder`
  - Language icons display appropriate text abbreviations (JS, TS, PY, GO, etc.) with language-specific colors
  - Header remains accessible during long configuration sessions with sticky positioning
  - Enhanced modal layout with proper content wrapping and spacing

### Technical Implementation

- Updated CSS styling for modal container with border radius and focus styling
- Implemented `position: sticky` header with proper z-index and background styling
- Added comprehensive language icon mapping with 30+ language support
- Removed all `showOutputOnRun` references from codebase, tests, and documentation
- Enhanced webview template with improved semantic structure and accessibility

## [0.19.4] - 2025-06-19

### Added

- **Chat Participant Integration:**
  - Added '@codebook' chat participant for VS Code chat integration
  - Interactive AI assistant for notebook management and code execution help
  - Context-aware responses about creating notebooks, executing code, and configuring settings
  - Follow-up suggestions based on user query types
  - Discoverable through "@tag:chat-participant" search in VS Code extensions marketplace
  - Rich markdown formatting in chat responses for better readability
  - Comprehensive error handling with user-friendly messages
  - Support for multiple trigger words (create, execute, configure, help, etc.)

### Changed

- Added "Chat" category to extension categories for better discoverability
- Enhanced extension activation events to include chat functionality
- Updated documentation to include chat participant usage and implementation patterns

### Technical Implementation

- Implemented ChatRequestHandler interface for VS Code chat API integration
- Added chat participant registration with custom icon and follow-up provider
- Integrated chat functionality into extension activation lifecycle
- Enhanced coding instructions with chat participant implementation guidelines

## [0.19.3] - 2025-06-11

### Fixed

- **Go Language Support Bug Fixes:**
  - Fixed intermittent "go.mod file not found" errors when executing Go cell-blocks
  - Resolved "EROFS: read-only file system" errors caused by incorrect file path resolution
  - Eliminated race condition in test file preparation that could cause execution failures
  - Improved path resolution fallbacks for better handling of untitled files and missing active editors
  - Enhanced file writing logic to properly handle both relative and absolute file paths

### Technical Implementation

- Fixed `writeDirAndFileSyncSafe` function in `io.ts` to properly construct full file paths
- Converted asynchronous file operations to synchronous in Go test preparation to prevent race conditions
- Added robust path fallback mechanisms using workspace folders and current working directory
- Improved error handling and defensive programming for edge cases
- Added comprehensive test suite for Go language support with 8 test cases covering configuration, path resolution, and code generation

### Testing

- Created new `go.test.ts` with comprehensive coverage of Go language functionality
- Added tests for path resolution edge cases and fallback scenarios
- Verified fix eliminates intermittent execution failures
- All 101 tests now passing including new Go-specific test suite

## [0.19.2] - 2025-06-09

### Fixed

- **Command System Improvements:**
  - Simplified working directory creation and error handling for better reliability
  - Enhanced error reporting and debugging for command execution issues
- **Configuration System Enhancements:**
  - Enhanced execPath resolution with improved path handling logic
  - Better error handling for invalid or missing path configurations
  - Fixed missing `fullExecPath` function that was causing test failures
  - Improved workspace path resolution for more robust configuration management

### Technical Implementation

- Streamlined directory creation process with cleaner error handling
- Enhanced `fullExecPath` function implementation for consistent path resolution
- Improved error messages and debugging information for configuration issues
- Better integration between command execution and path resolution systems

## [0.19.1] - 2025-06-07

### Added

- **Markdown Contributions Integration:**
  - Automatic discovery and integration with VS Code markdown extensions
  - Support for `markdown.markdownItPlugins` from other extensions
  - Integration with `markdown.previewStyles` for enhanced CSS styling
  - Support for `markdown.previewScripts` for interactive functionality
  - Zero-configuration compatibility with popular extensions (Markdown All in One, Mermaid, etc.)
  - Enhanced markdown rendering in CodebookMD notebooks using extension plugins
  - Comprehensive test coverage for markdown contributions system
  - New `MarkdownRenderingService` for centralized markdown processing
  - Documentation section dedicated to markdown contributions feature

### Changed

- Improved markdown rendering pipeline to leverage VS Code extension ecosystem
- Enhanced webview content generation with extension-contributed styles and scripts
- Updated documentation with comprehensive markdown contributions examples and use cases

### Technical Implementation

- Added `collectMarkdownContributions()` function for extension discovery
- Implemented `createMarkdownItWithPlugins()` for enhanced markdown-it instances
- Created `renderMarkdownWithContributions()` for extension-aware rendering
- Added robust error handling for missing or incompatible extensions
- Integrated markdown contributions into existing webview architecture

## [0.17.6] - 2025-06-05

### Added

- Markdown Contributions Integration:
  - Automatic discovery and integration with VS Code markdown extensions
  - Support for `markdown.markdownItPlugins` from other extensions
  - Integration with `markdown.previewStyles` for enhanced CSS styling
  - Support for `markdown.previewScripts` for interactive functionality
  - Zero-configuration compatibility with popular extensions (Markdown All in One, Mermaid, etc.)
  - Enhanced markdown rendering in CodebookMD notebooks using extension plugins
  - Comprehensive test coverage for markdown contributions system
  - New `MarkdownRenderingService` for centralized markdown processing
  - Documentation section dedicated to markdown contributions feature

### Changed

- Improved markdown rendering pipeline to leverage VS Code extension ecosystem
- Enhanced webview content generation with extension-contributed styles and scripts
- Updated documentation with comprehensive markdown contributions examples

### Technical Implementation

- Added `collectMarkdownContributions()` function for extension discovery
- Implemented `createMarkdownItWithPlugins()` for enhanced markdown-it instances
- Created `renderMarkdownWithContributions()` for extension-aware rendering
- Added robust error handling for missing or incompatible extensions
- Integrated markdown contributions into existing webview architecture

## [0.17.6] - 2025-06-05

### Fixed

- Cell configuration persistence across document edits:
  - Added tracking of cell insertions and deletions to maintain configuration indices
  - Automatically updates external configuration files when cells are added or removed
  - Properly shifts configuration indices when notebook structure changes
  - Preserves cell-specific settings through document reorganization

## [0.17.5] - 2025-06-04

### Fixed

- Shell script execution output handling:
  - Fixed missing command output in shell-script code blocks
  - Improved output capture and display for shell commands
  - Enhanced output pipeline to show command results properly
- Go test execution output filtering:
  - Removed extraneous test framework output like "RUN TestExecNotebook"
  - Added intelligent filtering of Go test infrastructure messages
  - Cleaner display of actual code execution results without test noise
  - Improved output transformer to handle various test output patterns

## [0.17.4]

### Added

- Custom CellConfig JSON Files functionality
  - External configuration storage in dedicated JSON files instead of notebook metadata
  - Configurable storage location via `codebook-md.notebookConfigPath` setting
  - Per-notebook configuration files named `<notebook-name>.config.json`
  - Support for all language-specific configuration options in external files
  - Automatic migration from embedded notebook configurations
  - Enhanced documentation for configuration file management

### Changed

- Cell configurations now stored externally by default for better version control
- Improved configuration file structure with cell index-based organization
- Enhanced configuration modal to work seamlessly with external JSON files
- Updated documentation with comprehensive CellConfig JSON Files section

### Benefits

- Cleaner notebook files without embedded configuration metadata
- Better collaboration through shareable configuration files
- Enhanced version control support for configuration tracking
- Easier backup and restoration of notebook settings

## [0.17.3]

### Fixed

- Go code-block execution improvements:
  - Fixed package name handling for both `execType: run` and `execType: test` modes
  - Resolved double output issue in Go test execution
  - Improved path resolution for Go package references
  - Better error handling for invalid package names

### Changed

- Configuration UI enhancements:
  - Streamlined code block configuration modal
  - Removed redundant execution type options for non-Go languages
  - Improved configuration hierarchy (cell-specific → workspace settings → defaults)
  - Cleaner interface for language-specific settings

## [0.17.1]

### Added

- Enhanced configuration UI with settings integration
  - Settings wheel icons added to configuration options
  - Direct access to VS Code settings from the configuration modal
  - Clicking a settings wheel opens VS Code settings filtered to that specific setting
  - Improved alignment and styling in configuration forms

### Changed

- Updated documentation to reflect the new UI-based configuration approach
- Removed outdated command-based configuration instructions
- Improved usability of the configuration modal interface

## [0.17.0]

### Added

- Native HTTP language support for executing HTTP requests
  - Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
  - Header and request body support
  - Environment variable substitution in headers using {{VARIABLE_NAME}} syntax
  - JSON response formatting
  - Cookie support for maintaining session state
  - Configuration options for timeouts, formatting, and request/response logging

## [0.16.0] - 2025-04-30

### Added

- Codebook Prompts feature for interactive input in code blocks
- String and Date input types with validation
- Multiple prompts support in a single code block
- Date formatting options for flexible output
- Interactive prompts with custom placeholder text
- Comprehensive documentation with examples for all supported languages
- Enhanced user experience with intuitive prompt workflow

## [0.15.2] - 2025-04-25

### Added

- "New Folder Group" button in My Notebooks view for quick folder group creation

## [0.15.1] - 2025-04-21

### Added

- Collapsible folder groups in My Notebooks webview
- Dynamic folder group collapsible functionality for better workspace organization
- Visual indicators for expanded and collapsed states
- "New Folder Group" button in My Notebooks view for quick folder group creation

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

- Development environment configuration- Basic project structure- Initial extension setup### Added## [0.0.1-0.0.3] - 2024- Core extension functionality- Basic markdown file support- Initial implementation of code block execution### Added## [0.1.0] - 2024- Various bug fixes and performance improvements### Fixed## [0.7.5] - 2024 - SQL - TypeScript - JavaScript - Shell/Bash - Golang- Language support for:- Output configuration options for code execution results- Support for executing code blocks in multiple languages### Added## [0.8.0] - 2024- Custom settings support for workspace, user, and folder-level configurations- File link hover preview functionality