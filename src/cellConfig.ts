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

/**
 * Get the notebook configuration file path for a given notebook
 * 
 * @param notebookUri The URI of the notebook
 * @returns The path to the notebook configuration file
 */
export function getNotebookConfigPath(notebookUri: Uri): string {
  // Get the setting for the notebook config directory
  const notebookConfigDir = workspace.getConfiguration('codebook-md').get<string>('notebookConfigPath', './codebook-md/');

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
 * Migrate existing notebook configuration from the notebook cell to the config file
 * 
 * @param notebookCell A cell from the notebook to migrate
 * @returns True if migration was successful or not needed, false if migration failed
 */
export async function migrateNotebookConfigToFile(notebookCell: NotebookCell): Promise<boolean> {
  try {
    if (!notebookCell.notebook) {
      console.error('Notebook not found for migration');
      return false;
    }

    const notebook = notebookCell.notebook;
    const lastCellIndex = notebook.cellCount - 1;

    // If no cells, nothing to migrate
    if (lastCellIndex < 0) {
      return true;
    }

    // Find the last cell that may contain the configurations
    const lastCell = notebook.cellAt(lastCellIndex);

    // If no last cell, nothing to migrate
    if (!lastCell || !lastCell.document) {
      return true;
    }

    const lastCellText = lastCell.document.getText();

    // Check if we have a configuration cell
    if (!lastCellText.includes('<!-- CodebookMD Cell Configurations -->')) {
      return true; // No configuration cell, nothing to migrate
    }

    try {
      // First try to extract the JSON configuration from HTML script tag format
      let jsonMatch = lastCellText.match(/<script type="application\/json">([\s\S]*?)<\/script>/);

      // If not found, try the markdown code block format
      if (!jsonMatch || !jsonMatch[1]) {
        jsonMatch = lastCellText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (!jsonMatch || !jsonMatch[1]) {
          console.log('No valid JSON configuration found in notebook cell');
          return true; // No valid JSON, nothing to migrate
        }
      }

      // Parse the JSON configuration
      const cellConfigs = JSON.parse(jsonMatch[1].trim());

      // Save configuration to the JSON file
      const notebookUri = notebook.uri;
      const saveSuccess = saveNotebookConfig(notebookUri, cellConfigs);

      if (!saveSuccess) {
        console.error('Failed to save migrated configuration to file');
        return false;
      }

      console.log('Successfully migrated notebook configuration to JSON file');
      return true;
    } catch (parseError) {
      console.error('Error parsing configuration cell during migration:', parseError);
      return false;
    }
  } catch (error) {
    console.error('Error during notebook config migration:', error);
    return false;
  }
}

// Functions are exported individually
