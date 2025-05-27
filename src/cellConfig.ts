import { NotebookCell, workspace, WorkspaceEdit, Range, NotebookCellData, NotebookCellKind, NotebookEdit } from 'vscode';

interface CellConfig {
  output?: Record<string, boolean | string>;
  [key: string]: unknown;
}

/**
 * Save cell configuration to the notebook metadata
 * The configuration is stored in a markdown cell at the end of the notebook
 * 
 * @param notebookCell The notebook cell to save configuration for
 * @param config The configuration to save
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function saveCellConfig(notebookCell: NotebookCell, config: CellConfig): Promise<boolean> {
  try {
    if (!notebookCell.notebook) {
      console.error('Notebook not found');
      return false;
    }

    const cellIndex = notebookCell.index;
    const languageId = notebookCell.document.languageId;

    console.log(`Saving cell config for cell ${cellIndex} with language ${languageId}`);
    console.log(`Config data: ${JSON.stringify(config)}`);    // Make sure the notebook has cells
    if (notebookCell.notebook.cellCount === 0) {
      console.error('Cannot save configuration: notebook has no cells');
      return false;
    }

    // Find the last cell that may contain the configurations
    const lastCellIndex = notebookCell.notebook.cellCount - 1;
    const lastCell = notebookCell.notebook.cellAt(lastCellIndex);

    // Make sure the last cell exists and has a document
    if (!lastCell || !lastCell.document) {
      console.error('Cannot save configuration: last cell or document not available');
      return false;
    }

    // Make sure we can write to the document
    if (lastCell.document.isUntitled || lastCell.document.isDirty || lastCell.document.isClosed) {
      console.error('Cannot save configuration: document is untitled, dirty, or closed');
      return false;
    }

    const lastCellText = lastCell.document.getText();

    // Check if we have a configuration cell already
    const hasConfigCell = lastCellText.includes('<!-- CodebookMD Cell Configurations -->');
    console.log(`Config cell exists: ${hasConfigCell}`);

    // We'll prepare different configuration formats depending on whether the cell exists
    // This is handled in the respective code branches below

    try {
      // Get the workspace edit API
      const workspaceEdit = new WorkspaceEdit(); if (hasConfigCell) {
        // Update existing config cell
        // First check for HTML script format (preferred format)
        const scriptMatch = lastCellText.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        // Then check for markdown code block format (legacy format) if script format is not found
        const markdownMatch = !scriptMatch ? lastCellText.match(/```json\s*\n([\s\S]*?)\n```/) : null;

        const configMatch = scriptMatch || markdownMatch;

        if (configMatch) {
          try {
            // Parse existing config
            let existingConfig;
            try {
              existingConfig = JSON.parse(configMatch[1]);
            } catch (jsonParseError) {
              console.error('Error parsing existing cell config JSON:', jsonParseError);
              console.log('Invalid JSON content:', configMatch[1]);

              // Create a new config object if parsing fails
              existingConfig = {};
            }

            // Update with new config for this cell
            const cellKey = cellIndex.toString();
            existingConfig[cellKey] = { config };

            // Create updated config cell content
            let updatedContent;

            if (markdownMatch) {
              // Convert from markdown code block format to HTML script format
              updatedContent = lastCellText.replace(
                /```json\s*\n([\s\S]*?)\n```/,
                `<script type="application/json">\n${JSON.stringify(existingConfig, null, 2)}\n</script>`
              );
            } else {
              // Update existing script format
              updatedContent = lastCellText.replace(
                /<script type="application\/json">([\s\S]*?)<\/script>/,
                `<script type="application/json">\n${JSON.stringify(existingConfig, null, 2)}\n</script>`
              );
            }

            console.log(`Updating config for cell ${cellIndex}, language ${languageId}`, existingConfig);

            // Apply edit
            workspaceEdit.replace(
              lastCell.document.uri,
              new Range(0, 0, lastCell.document.lineCount, 0),
              updatedContent
            );
          } catch (parseError) {
            console.error('Error parsing existing config:', parseError);
            console.log('Last cell text:', lastCellText);
            return false;
          }
        }
      } else {
        // Create a new config cell at the end of notebook
        // Using HTML script tag in markdown to hide the JSON when rendered
        const scriptConfig: Record<string, { config: CellConfig; }> = {};
        const cellKey = cellIndex.toString();
        scriptConfig[cellKey] = { config };

        const configCellContent =
          '<!-- CodebookMD Cell Configurations -->\n' +
          '<!-- DO NOT EDIT -->\n' +
          '<div style="display: none;">\n' +
          '  <script type="application/json">\n' +
          JSON.stringify(scriptConfig, null, 2) +
          '\n  </script>\n' +
          '</div>';

        try {
          // Create and prepare a workspace edit
          const workspaceEdit = new WorkspaceEdit();

          // We need to create a new markdown cell at the end of the notebook
          // First, get the notebook document URI
          const notebookUri = notebookCell.notebook.uri;

          // Create a new markdown cell with the configuration content
          // Create NotebookCellData
          const cellData: NotebookCellData = {
            kind: NotebookCellKind.Markup, // Markdown cell
            value: configCellContent,
            languageId: 'markdown'
          };

          // Create a NotebookEdit to insert a cell at the end of the notebook
          const notebookEdit = NotebookEdit.insertCells(
            notebookCell.notebook.cellCount,
            [cellData]
          );

          // Add the edit to the WorkspaceEdit
          workspaceEdit.set(notebookUri, [notebookEdit]);

          // Apply the edit
          const editSuccess = await workspace.applyEdit(workspaceEdit);
          if (!editSuccess) {
            console.error('Failed to add configuration cell. Cell index:', cellIndex, 'Language:', languageId);
            return false;
          }

          console.log('Successfully created new configuration cell for cell', cellIndex);
          return true;
        } catch (newCellError) {
          console.error('Error creating configuration cell:', newCellError);
          return false;
        }
      }

      // Apply the edits (only reached when updating an existing config cell)
      const editSuccess = await workspace.applyEdit(workspaceEdit);
      if (!editSuccess) {
        console.error('Failed to apply workspace edit. Cell index:', cellIndex, 'Language:', languageId);
        return false;
      }

      console.log('Successfully saved configuration for cell', cellIndex);

      return true;
    } catch (editError) {
      console.error('Error applying edits:', editError);
      console.log('Failed operation details:', {
        cellIndex: cellIndex,
        languageId: languageId,
        hasConfigCell: hasConfigCell,
        notebookUri: notebookCell.notebook?.uri.toString()
      });
      return false;
    }
  } catch (error: unknown) {
    console.error('Error saving cell configuration:', error);
    console.log('Failed operation details:', {
      cellIndex: notebookCell.index,
      languageId: notebookCell.document.languageId,
      notebook: notebookCell.notebook ? 'present' : 'missing'
    });
    return false;
  }
}

interface ConfigOption {
  type: string;
  default: string | boolean | Record<string, unknown>;
  options?: string[];
  description: string;
  internal?: boolean; // Optional flag to mark options for internal use only (not displayed in UI)
}

type ConfigOptions = Record<string, ConfigOption>;

/**
 * Helper function to get language-specific config options 
 * @param languageId The language ID to get config options for
 * @returns Configuration options for the specific language
 */
export function getLanguageConfigOptions(languageId: string): ConfigOptions {
  // Return the structure of language-specific config options
  switch (languageId) {
    case 'go':
      return {
        execType: {
          type: 'select',
          default: 'run',
          options: ['run', 'test'],
          description: 'Execution type for Go code: \'run\' uses execTypeRunConfig, \'test\' uses execTypeTestConfig.'
        },
        execTypeRunConfig: {
          type: 'object',
          default: {
            execPath: '.',
            filename: 'main.go'
          },
          description: 'Configuration for \'run\' execution type.'
        },
        execTypeTestConfig: {
          type: 'object',
          default: {
            execPath: '.',
            filename: 'codebook_md_exec_test.go',
            buildTag: 'playground'
          },
          description: 'Configuration for \'test\' execution type.'
        },
        goimportsCmd: {
          type: 'select',
          default: 'gopls imports',
          options: ['gopls imports', 'goimports'],
          description: '\'goimports\' requires goimports to be installed.'
        }
      };
    case 'bash':
    case 'shellscript':
    case 'shell':
      return {
        execSingleLineAsCommand: {
          type: 'boolean',
          default: false,
          description: 'Execute single-line bash code-blocks as commands.'
        }
      };
    case 'python':
      return {
        pythonCmd: {
          type: 'string',
          default: 'python3',
          description: 'Command to use for running Python code-blocks.'
        }
      };
    case 'sql':
      return {
        execOptions: {
          type: 'string',
          default: '',
          description: 'Options to use for SQL connections (comma-separated).'
        }
      };
    case 'http':
      return {
        execCmd: {
          type: 'string',
          default: 'curl',
          description: 'Command to use for HTTP requests.'
        },
        execFilename: {
          type: 'string',
          default: 'codebook_md_exec_http.sh',
          description: 'Filename for the executable HTTP script.'
        },
        verbose: {
          type: 'boolean',
          default: true,
          description: 'Use verbose mode for HTTP requests.'
        }
      };
    default:
      return {};
  }
}

/**
 * Get standard output configuration options
 * @returns Output configuration options
 */
export function getOutputConfigOptions(): ConfigOptions {
  return {
    showExecutableCodeInOutput: {
      type: 'boolean',
      default: true,
      description: 'Show the executable code at the top of the output.'
    },
    showOutputOnRun: {
      type: 'boolean',
      default: true,
      description: 'Show the output cell on run.'
    },
    replaceOutputCell: {
      type: 'boolean',
      default: true,
      description: 'Prepend the executable code to the output.'
    },
    showTimestamp: {
      type: 'boolean',
      default: true,
      description: 'Show the timestamp at the top of the output.'
    },
    timestampTimezone: {
      type: 'string',
      default: 'UTC',
      description: 'Timezone to use for the timestamp.'
    }
  };
}

// Functions are exported individually
