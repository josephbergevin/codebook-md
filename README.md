<div style="padding-bottom: 10px;">
<img src="extension/src/img/logo_3_800x800.png" alt="Codebook MD Logo" width="256" height="256" />
</div>

# Codebook MD

Bring your markdown to life with this VS Code extension! Execute code blocks and navigate to internal permalinks all in your local environment. Inspired by Jupyter notebooks, and a furious ongoing battle against boring documentation and markdown files.

## Features

### Executable code blocks

Execute code blocks in markdown files by pressing the corresponding Play button at the top of the code block.

- Languages supported:

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
    - Executed using a SQL extension offering Codelens functionality.
  - HTTP
    - Executed using the REST Client extension.

### Notebook Organization in Activity Bar

The Codebook MD extension provides a tree view in the activity bar for organizing your markdown files. This allows you to configure dynamically generated notebooks, as well as create virtual folders, to help organize your markdown files for quick and easy access.

#### Dynamically Generated Folders in My Notebooks View

Codebook MD provides a "My Notebooks" view and dynamically creates folders based on the currently focused file. This allows you to have easy access to relevant markdown files!

- **Dynamic Folder Group**: Automatically generates a folder based on the currently focused file
- **Virtual Folders**: Create custom folder hierarchies to organize your markdown files
- **Custom Display Names**: Rename files and folders with descriptive names without changing the actual files
- **Hierarchical Structure**: Create nested folders for organized categorization
- **Quick Access**: Access your important markdown documents with one click

##### Dynamic Folder Group Configuration

You can customize the dynamic folder group through VS Code settings (`settings.json`):

```json
{
  "codebook-md": {
    "dynamicFolderGroup": {
      "enabled": true,
      "name": "Relevant Docs",
      "description": "Relevant docs for the current file",
      "subFolderInclusions": [
        ".github",
        ".vscode"
      ],
      "exclusions": [
        "node_modules",
        "out",
        "dist"
      ]
    }
  }
}
```

**Configuration Options:**

- `enabled`: Enable or disable the dynamic folder group (default: `true`)
- `name`: Custom name for the dynamic folder group (default: `Current Context`)
- `description`: Description shown when hovering over the folder group (default: `Auto-generated based on the current file`)
- `subFolderInclusions`: Sub-folders to include when searching for markdown files (default: `[]`)
- `exclusions`: Patterns to exclude from the search (default: `["node_modules", "out", "dist"]`)

The dynamic folder group will only show folders that contain markdown files after applying exclusions, providing a clean and focused view of relevant documentation.

#### User-Defined Virtual Folders

The Codebook MD extension allows you to create user-defined virtual folders in the activity bar. This feature enables you to organize your markdown files into a hierarchical structure, making it easier to navigate and access your documentation.

- **Version Control Integration**: The configuration file can be committed to your repository, allowing team sharing of notebook organization
- **Workspace-Specific**: Each workspace has its own configuration file, allowing for project-specific organization
- **Manual Editing**: Advanced users can directly edit the configuration file for bulk changes

##### Configuration File

The configuration for user-defined virtual folders is stored in a JSON file located at `.vscode/codebook-md.json` in your workspace. This file contains the structure and organization of your virtual folders, including their names, descriptions, and the markdown files they contain. All changes made through the Tree View UI are automatically saved to this file.

- Folders:

  - `name`: Display name for the folder
  - `folderPath`: Hierarchical path (using dots as separators)
  - `icon`: Optional path to a custom icon for the folder
  - `hide`: Optional boolean to hide a folder in the UI
  - `files`: Array of file entries in this folder

- Files:

  - `name`: Display name for the file
  - `path`: Path to the markdown file (absolute or relative to workspace root)

- Config Tips:

  - Use descriptive display names to make your documents easier to find
  - Create a logical folder hierarchy based on your projects or document types
  - Regularly refresh the Tree View if you make changes to files outside VS Code
  - Configure dynamic folder groups to focus on relevant documentation folders and exclude noise
  - Use the `subFolderInclusions` setting to include specific sub-folders like `.github` for documentation

- Example configuration format:

```json
{
  "folderGroups": [
    {
      "name": "Workspace",
      "description": "Workspace folder group",
      "folders": [
        {
          "name": "Projects",
          "folders": [
            {
              "name": "SubProject1",
              "files": [
                {
                  "name": "Overview",
                  "path": "projects/subproject1/overview.md"
                }
              ]
            }
          ],
          "files": [
            {
              "name": "Project Plan",
              "path": "projects/project-plan.md"
            }
          ]
        },
        {
          "name": "Documentation",
          "folders": [
            {
              "name": "Guides",
              "files": [
                {
                  "name": "Getting Started",
                  "path": "docs/guides/getting-started.md"
                }
              ]
            }
          ],
          "files": [
            {
              "name": "Readme",
              "path": "docs/readme.md"
            }
          ]
        }
      ]
    }
  ]
}
```

### Environment Variables Support

Shell scripts executed in CodebookMD now have access to environment variables set in VS Code settings:

- Automatically detects and uses variables from `terminal.integrated.env.*` settings
- Platform-specific support for macOS, Windows, and Linux
- VS Code environment variables take precedence over system environment variables
- Secure storage of credentials and configuration without hardcoding in markdown files

Configure environment variables in your VS Code settings:

```json
{
  "terminal.integrated.env.osx": {
    "API_KEY": "your-api-key",
    "DATABASE_URL": "postgres://user:password@localhost:5432/mydb",
    "PATH": "${env:PATH}:/custom/path"
  }
}
```

These variables are automatically available in your shell code blocks:

```shellscript
# This code block will have access to API_KEY, DATABASE_URL, and the extended PATH
echo $API_KEY
echo $DATABASE_URL
echo $PATH
```

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

## Release Notes

All notable changes to Codebook MD are documented in our [CHANGELOG](CHANGELOG.md). We follow [Semantic Versioning](https://semver.org/) and structure our changelog according to [Keep a Changelog](https://keepachangelog.com/).

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