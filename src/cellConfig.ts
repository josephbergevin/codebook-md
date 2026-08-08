import { NotebookCell, workspace, Uri } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { writeDirAndFileSyncSafe } from './io';
import { ExecutionHistoryEntry, ExecutionHistory } from './types/executionHistory';

interface CellConfig {
  output?: Record<string, boolean | string>;
  executionHistory?: ExecutionHistoryEntry[];
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
  default: string | boolean | number | Record<string, unknown>;
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
      // Shell cells are executed verbatim via `bash -c`; there are no
      // language-specific options beyond the shared output config.
      return {};
    case 'python':
      return {
        execCmd: {
          type: 'string',
          default: 'python3',
          description: 'Command to use for running Python code-blocks.'
        },
        execFilename: {
          type: 'string',
          default: 'codebook_md_exec.py',
          description: 'Filename for the generated Python execution script.'
        }
      };
    case 'sql':
      return {
        execCmd: {
          type: 'string',
          default: 'mysql',
          description: 'CLI command used to execute SQL code blocks (e.g. \'mysql\', \'psql\').'
        },
        execOptions: {
          type: 'string',
          default: '',
          description: 'Options to use for SQL connections (comma-separated).'
        },
        execFilename: {
          type: 'string',
          default: 'codebook_md_exec.sql',
          description: 'Filename for the generated SQL execution script.'
        }
      };
    case 'javascript':
      return {
        execFilename: {
          type: 'string',
          default: 'codebook_md_exec.js',
          description: 'Filename for the generated JavaScript execution script.'
        }
      };
    case 'typescript':
      return {
        execFilename: {
          type: 'string',
          default: 'codebook_md_exec.ts',
          description: 'Filename for the generated TypeScript execution script.'
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
 * Get execution history configuration options
 * @returns Execution history configuration options
 */
export function getExecutionHistoryConfigOptions(): ConfigOptions {
  return {
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Enable execution history tracking for code blocks.'
    },
    historyLimit: {
      type: 'number',
      default: 10,
      description: 'Maximum number of execution history entries to retain per cell (0 for unlimited).'
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

// ========================================================================
// Execution History Functions
// ========================================================================

/**
 * Get execution history configuration from workspace settings
 * @returns Execution history configuration
 */
export function getExecutionHistoryConfig(): { enabled: boolean; historyLimit: number; } {
  const config = workspace.getConfiguration('codebook-md.executionHistory');
  return {
    enabled: config.get<boolean>('enabled', true),
    historyLimit: config.get<number>('historyLimit', 10)
  };
}

/**
 * Add an execution history entry for a specific cell
 * 
 * @param notebookUri The URI of the notebook
 * @param entry The execution history entry to add
 * @returns True if successful, false otherwise
 */
export function addHistoryEntry(notebookUri: Uri, entry: ExecutionHistoryEntry): boolean {
  try {
    // Check if history is enabled
    const historyConfig = getExecutionHistoryConfig();
    if (!historyConfig.enabled) {
      console.log('Execution history is disabled');
      return false;
    }

    // Load existing configuration
    const config = loadNotebookConfig(notebookUri);

    // Get the cell's configuration or create a new one
    const cellKey = entry.cellIndex.toString();
    if (!config[cellKey]) {
      config[cellKey] = { config: {} };
    }

    // Initialize history array if it doesn't exist or if it's not an array
    if (!config[cellKey].config.executionHistory || !Array.isArray(config[cellKey].config.executionHistory)) {
      config[cellKey].config.executionHistory = [];
    }

    const history = config[cellKey].config.executionHistory as ExecutionHistoryEntry[];

    // Add the new entry at the beginning (newest first)
    history.unshift(entry);

    // Respect the history limit if set (0 means unlimited)
    if (historyConfig.historyLimit > 0 && history.length > historyConfig.historyLimit) {
      history.splice(historyConfig.historyLimit);
    }

    // Save the updated configuration
    return saveNotebookConfig(notebookUri, config);
  } catch (error) {
    console.error('Error adding history entry:', error);
    return false;
  }
}

/**
 * Get execution history for a specific cell
 * 
 * @param notebookUri The URI of the notebook
 * @param cellIndex The index of the cell
 * @returns Array of execution history entries (newest first), or empty array if none exists
 */
export function getHistoryForCell(notebookUri: Uri, cellIndex: number): ExecutionHistoryEntry[] {
  try {
    const config = loadNotebookConfig(notebookUri);
    const cellKey = cellIndex.toString();

    if (!config[cellKey] || !config[cellKey].config.executionHistory) {
      return [];
    }

    const history = config[cellKey].config.executionHistory;

    // Ensure it's an array before returning
    if (!Array.isArray(history)) {
      return [];
    }

    return history as ExecutionHistoryEntry[];
  } catch (error) {
    console.error('Error getting history for cell:', error);
    return [];
  }
}

/**
 * Get execution history for all cells in a notebook
 * 
 * @param notebookUri The URI of the notebook
 * @returns ExecutionHistory object mapping cell indices to their history entries
 */
export function getAllHistory(notebookUri: Uri): ExecutionHistory {
  try {
    const config = loadNotebookConfig(notebookUri);
    const history: ExecutionHistory = {};

    Object.entries(config).forEach(([cellKey, value]) => {
      if (value.config.executionHistory) {
        history[cellKey] = value.config.executionHistory as ExecutionHistoryEntry[];
      }
    });

    return history;
  } catch (error) {
    console.error('Error getting all history:', error);
    return {};
  }
}

/**
 * Clear execution history for a specific cell
 * 
 * @param notebookUri The URI of the notebook
 * @param cellIndex The index of the cell
 * @returns True if successful, false otherwise
 */
export function clearHistoryForCell(notebookUri: Uri, cellIndex: number): boolean {
  try {
    const config = loadNotebookConfig(notebookUri);
    const cellKey = cellIndex.toString();

    if (config[cellKey] && config[cellKey].config.executionHistory) {
      delete config[cellKey].config.executionHistory;
      return saveNotebookConfig(notebookUri, config);
    }

    return true; // Nothing to clear
  } catch (error) {
    console.error('Error clearing history for cell:', error);
    return false;
  }
}

/**
 * Delete a specific execution history entry for a cell
 * 
 * @param notebookUri The URI of the notebook
 * @param cellIndex The index of the cell
 * @param entryId The ID of the history entry to delete
 * @returns True if successful, false otherwise
 */
export function deleteHistoryEntry(notebookUri: Uri, cellIndex: number, entryId: string): boolean {
  try {
    const config = loadNotebookConfig(notebookUri);
    const cellKey = cellIndex.toString();

    if (config[cellKey] && config[cellKey].config.executionHistory) {
      const history = config[cellKey].config.executionHistory;

      // Filter out the entry with the specified ID
      if (Array.isArray(history)) {
        config[cellKey].config.executionHistory = history.filter((entry: ExecutionHistoryEntry) => entry.id !== entryId);
        return saveNotebookConfig(notebookUri, config);
      }
    }

    return false; // Entry not found
  } catch (error) {
    console.error('Error deleting history entry:', error);
    return false;
  }
}

/**
 * Clear execution history for all cells in a notebook
 * 
 * @param notebookUri The URI of the notebook
 * @returns True if successful, false otherwise
 */
export function clearAllHistory(notebookUri: Uri): boolean {
  try {
    const config = loadNotebookConfig(notebookUri);

    // Remove executionHistory from all cells
    Object.keys(config).forEach(cellKey => {
      if (config[cellKey].config.executionHistory) {
        delete config[cellKey].config.executionHistory;
      }
    });

    return saveNotebookConfig(notebookUri, config);
  } catch (error) {
    console.error('Error clearing all history:', error);
    return false;
  }
}

// Functions are exported individually
