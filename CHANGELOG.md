# Changelog
All notable changes to the Codebook MD extension will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
