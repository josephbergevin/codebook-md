<div style="padding-bottom: 10px;">
<img src="extension/src/img/logo_3_800x800.png" alt="Codebook MD Logo" width="256" height="256" />
</div>

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

## Tree View Feature Documentation

The Tree View feature in [CodebookMD](https://github.com/josephbergevin/codebook-md) allows you to organize markdown files into a customizable hierarchical structure for easy access and navigation. This feature is especially useful when working with many markdown documents across multiple projects.

### Features

- **Virtual Folders**: Create custom folder hierarchies to organize your markdown files
- **Custom Display Names**: Rename files and folders with descriptive names without changing the actual files
- **Hierarchical Structure**: Create nested folders for organized categorization
- **Quick Access**: Access your important markdown documents with one click

### Using the Tree View

#### Opening the Tree View

The Tree View is accessible from the VS Code activity bar. Click on the CodebookMD icon in the activity bar to see your organized markdown files.

#### Adding Virtual Folders

1. Click on the "New Folder" icon (📁) at the top of the Tree View
2. Enter a display name for your folder (e.g., "Projects")
3. The new virtual folder will be added to the top-level of the Tree View

#### Creating Sub-folders

1. Right-click on any folder in the Tree View
2. Select "Add Sub-folder" from the context menu
3. Enter a display name for the sub-folder (e.g., "Documentation")
4. The sub-folder will be created inside the selected parent folder

#### Adding Files to Folders

1. Right-click on a folder where you want to add a file
2. Select "Add File" from the context menu
3. Choose a markdown file from the file picker dialog
4. Enter a display name for the file
5. The file will appear under the selected folder in the Tree View

#### Renaming Items

##### Renaming Files:
1. Right-click on a file in the Tree View
2. Select "Rename" from the context menu
3. Enter a new display name for the file
4. The file will be shown with the new name in the Tree View

##### Renaming Folders:
1. Right-click on a folder in the Tree View
2. Select "Rename Folder" from the context menu
3. Enter a new display name for the folder
4. The folder will be shown with the new name in the Tree View

#### Removing Files

1. Right-click on a file in the Tree View
2. Select "Remove from Tree View" from the context menu
3. The file will be removed from the Tree View (the actual file is not deleted)

### Configuration

You can customize the Tree View through the `codebook-md.treeView` settings in your VS Code settings. The Tree View structure is stored in your workspace or user settings.

```json
{
  "codebook-md.treeView": {
    "folders": [
      {
        "name": "Projects",
        "folderPath": "projects",
        "files": []
      },
      {
        "name": "Documentation",
        "folderPath": "projects.documentation",
        "files": [
          {
            "name": "Getting Started",
            "path": "docs/getting-started.md"
          }
        ]
      }
    ]
  }
}
```

#### Configuration Properties

##### Folders:

- `name`: Display name for the folder
- `folderPath`: Hierarchical path (using dots as separators)
- `icon`: Optional path to a custom icon for the folder
- `hide`: Optional boolean to hide a folder in the UI
- `files`: Array of file entries in this folder

##### Files:

- `name`: Display name for the file
- `path`: Path to the markdown file (absolute or relative to workspace root)

### Commands

The Tree View extension provides several commands, which you can access via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac):

- `Codebook: Add File to Tree View`
- `Codebook: Add Virtual Folder to Tree View`
- `Codebook: Add Current File to Tree View`
- `Refresh Tree View`

### Context Menu Actions

Right-click on items in the Tree View to access context-specific actions:

#### Folder Context Menu:
- Add File
- Add Sub-folder
- Rename Folder

#### File Context Menu:
- Remove from Tree View
- Rename

### Tips

- Use descriptive display names to make your documents easier to find
- Create a logical folder hierarchy based on your projects or document types
- Regularly refresh the Tree View if you make changes to files outside VS Code
