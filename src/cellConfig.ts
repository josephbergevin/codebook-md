import { NotebookCell, workspace, Uri } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { writeDirAndFileSyncSafe } from './io';

interface CellConfig {
  output?: Record<string, boolean | string>;
  [key: string]: unknown;
}

/**
 * Save cell configuration to a separate JSON file instead of notebook metadata
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
    console.log(`Config data: ${JSON.stringify(config)}`);

    // Get the notebook URI
    const notebookUri = notebookCell.notebook.uri;

    // Load existing config from file (if any)
    const existingConfig = loadNotebookConfig(notebookUri);

    // Update with new config for this cell
    const cellKey = cellIndex.toString();
    existingConfig[cellKey] = { config };

    // Save the updated config to the file
    const saveSuccess = saveNotebookConfig(notebookUri, existingConfig);
    if (!saveSuccess) {
      console.error(`Failed to save configuration for cell ${cellIndex} with language ${languageId}`);
      return false;
    }

    console.log(`Successfully saved configuration for cell ${cellIndex} to config file`);
    return true;
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
      description: 'Include the executable code in the output.'
    },
    replaceOutputCell: {
      type: 'boolean',
      default: true,
      description: 'Clear the output cell on run.'
    },
    showTimestamp: {
      type: 'boolean',
      default: true,
      description: 'Include the timestamp in the output.'
    },
    timestampTimezone: {
      type: 'string',
      default: 'UTC',
      description: 'Timezone to use for the timestamp.'
    }
  };
}

/**
 * Get the notebook configuration file path for a given notebook
 * 
 * @param notebookUri The URI of the notebook
 * @returns The path to the notebook configuration file
 */
export function getNotebookConfigPath(notebookUri: Uri): string {
  // Get the configuration settings
  const config = workspace.getConfiguration('codebook-md');

  // Get notebookConfigPath setting, but if not explicitly set, use execPath as default
  let notebookConfigDir = config.get<string>('notebookConfigPath');

  // If notebookConfigPath is not set, fall back to execPath
  if (!notebookConfigDir) {
    notebookConfigDir = config.get<string>('execPath', './codebook-md/');
  }

  // Get the notebook filename and create config filename
  const notebookPath = notebookUri.fsPath;
  const notebookFilename = path.basename(notebookPath);
  const configFilename = `${notebookFilename}.config.json`;

  // Resolve the config directory path properly
  let resolvedConfigDir: string;
  if (path.isAbsolute(notebookConfigDir)) {
    resolvedConfigDir = notebookConfigDir;
  } else {
    // For relative paths, resolve relative to the notebook's directory
    const notebookDir = path.dirname(notebookPath);
    resolvedConfigDir = path.resolve(notebookDir, notebookConfigDir);
  }

  // Combine the directory and filename
  const configPath = path.join(resolvedConfigDir, configFilename);

  return configPath;
}

/**
 * Load notebook configuration from the configuration file
 * 
 * @param notebookUri The URI of the notebook
 * @returns The notebook configuration or an empty object if no configuration exists
 */
export function loadNotebookConfig(notebookUri: Uri): Record<string, { config: CellConfig; }> {
  const configPath = getNotebookConfigPath(notebookUri);

  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configContent);
    }
  } catch (error) {
    console.error(`Error loading notebook config from ${configPath}:`, error);
  }

  return {};
}

/**
 * Save notebook configuration to the configuration file
 * 
 * @param notebookUri The URI of the notebook
 * @param config The notebook configuration to save
 * @returns True if successful, false otherwise
 */
export function saveNotebookConfig(notebookUri: Uri, config: Record<string, { config: CellConfig; }>): boolean {
  try {
    const configPath = getNotebookConfigPath(notebookUri);
    const configDir = path.dirname(configPath);

    writeDirAndFileSyncSafe(configDir, configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving notebook config:', error);
    return false;
  }
}

/**
 * Updates notebook configuration indices when cells are added or removed
 *
 * @param notebookUri The URI of the notebook
 * @param changeType 'insert' or 'delete'
 * @param startIndex The index where the change occurred
 * @param count The number of cells affected
 * @returns True if the update was successful, false otherwise
 */
export function updateNotebookConfigIndices(
  notebookUri: Uri,
  changeType: 'insert' | 'delete',
  startIndex: number,
  count: number
): boolean {
  try {
    // Load existing configuration
    const existingConfig = loadNotebookConfig(notebookUri);

    if (Object.keys(existingConfig).length === 0) {
      // No configuration to update
      return true;
    }

    // Create a new configuration object
    const newConfig: Record<string, { config: CellConfig; }> = {};

    // Process each configuration entry
    Object.entries(existingConfig).forEach(([indexStr, value]) => {
      const cellIndex = parseInt(indexStr, 10);

      if (isNaN(cellIndex)) {
        // Keep non-numeric keys unchanged
        newConfig[indexStr] = value;
        return;
      }

      if (changeType === 'insert') {
        // For insertion, shift indices after the insertion point
        if (cellIndex >= startIndex) {
          newConfig[(cellIndex + count).toString()] = value;
        } else {
          newConfig[indexStr] = value;
        }
      } else if (changeType === 'delete') {
        // For deletion, shift indices and remove deleted cells
        if (cellIndex < startIndex) {
          // Before deletion point - keep the same
          newConfig[indexStr] = value;
        } else if (cellIndex >= startIndex + count) {
          // After deletion point - shift backward
          newConfig[(cellIndex - count).toString()] = value;
        }
        // Cells in the deletion range are omitted
      }
    });

    // Save the updated configuration
    return saveNotebookConfig(notebookUri, newConfig);
  } catch (error) {
    console.error('Error updating notebook configuration indices:', error);
    return false;
  }
}

// Functions are exported individually
