import { NotebookCell, workspace } from 'vscode';
import { ExecutionHistoryEntry } from './types/executionHistory';
import { CellConfig, readCellConfig, updateCellConfig } from './cellStore';

export { CellConfig, getNotebookConfigPath } from './cellStore';

/**
 * saveCellConfig replaces a cell's stored configuration.
 *
 * @param notebookCell The notebook cell to save configuration for
 * @param config The configuration to save; an empty object removes it
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function saveCellConfig(notebookCell: NotebookCell, config: CellConfig): Promise<boolean> {
  try {
    return updateCellConfig(notebookCell, () => config);
  } catch (error: unknown) {
    console.error('Error saving cell configuration:', error);
    return false;
  }
}

export interface ConfigOption {
  type: string;
  label?: string; // Short label shown in the config modal; description is shown as help text
  default: string | boolean | number | Record<string, unknown>;
  options?: string[];
  description: string;
  internal?: boolean; // Optional flag to mark options for internal use only (not displayed in UI)
}

export type ConfigOptions = Record<string, ConfigOption>;

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
          label: 'Execution type',
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
          label: 'Imports tool',
          default: 'gopls imports',
          options: ['gopls imports', 'goimports'],
          description: '\'goimports\' requires goimports to be installed.'
        }
      };
    case 'bash':
    case 'shellscript':
    case 'shell':
      return {
        persistentSession: {
          type: 'boolean',
          label: 'Persistent shell session',
          default: false,
          description: 'Run in the notebook\'s persistent shell session, so cd, export and variables carry over between cells.'
        }
      };
    case 'python':
      return {
        execCmd: {
          type: 'string',
          label: 'Command',
          default: 'python3',
          description: 'Command to use for running Python code-blocks.'
        },
        execFilename: {
          type: 'string',
          label: 'Script filename',
          default: 'codebook_md_exec.py',
          description: 'Filename for the generated Python execution script.'
        }
      };
    case 'sql':
      return {
        execCmd: {
          type: 'string',
          label: 'Command',
          default: 'mysql',
          description: 'CLI command used to execute SQL code blocks (e.g. \'mysql\', \'psql\').'
        },
        execOptions: {
          type: 'list',
          label: 'Connection options',
          default: '',
          description: 'Options passed to the SQL command before the statement, e.g. -h localhost -u root mydb.'
        },
        execFilename: {
          type: 'string',
          label: 'Script filename',
          default: 'codebook_md_exec.sql',
          description: 'Filename for the generated SQL execution script.'
        }
      };
    case 'javascript':
      return {
        execFilename: {
          type: 'string',
          label: 'Script filename',
          default: 'codebook_md_exec.js',
          description: 'Filename for the generated JavaScript execution script.'
        }
      };
    case 'typescript':
      return {
        execFilename: {
          type: 'string',
          label: 'Script filename',
          default: 'codebook_md_exec.ts',
          description: 'Filename for the generated TypeScript execution script.'
        }
      };
    case 'http':
      return {
        execCmd: {
          type: 'string',
          label: 'Command',
          default: 'curl',
          description: 'Command to use for HTTP requests.'
        },
        execFilename: {
          type: 'string',
          label: 'Script filename',
          default: 'codebook_md_exec_http.sh',
          description: 'Filename for the executable HTTP script.'
        },
        verbose: {
          type: 'boolean',
          label: 'Verbose output',
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
      label: 'Show code in output',
      default: true,
      description: 'Include the executable code in the output.'
    },
    replaceOutputCell: {
      type: 'boolean',
      label: 'Replace output on each run',
      default: true,
      description: 'Clear the output cell on run.'
    },
    showTimestamp: {
      type: 'boolean',
      label: 'Show timestamp',
      default: true,
      description: 'Include the timestamp in the output.'
    },
    timestampTimezone: {
      type: 'string',
      label: 'Timestamp timezone',
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
      label: 'Record execution history',
      default: true,
      description: 'Enable execution history tracking for code blocks.'
    },
    historyLimit: {
      type: 'number',
      label: 'History entries per cell',
      default: 10,
      description: 'Maximum number of execution history entries to retain per cell (0 for unlimited).'
    }
  };
}

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
 * addHistoryEntry records a run of a cell, newest first, keeping at most the
 * configured number of entries.
 *
 * @returns True if the entry was saved, false otherwise (including when history is disabled)
 */
export function addHistoryEntry(notebookCell: NotebookCell, entry: ExecutionHistoryEntry): boolean {
  try {
    const historyConfig = getExecutionHistoryConfig();
    if (!historyConfig.enabled) {
      return false;
    }
    return updateCellConfig(notebookCell, config => {
      const history = Array.isArray(config.executionHistory) ? [...config.executionHistory] : [];
      history.unshift(entry);
      // 0 means unlimited
      if (historyConfig.historyLimit > 0 && history.length > historyConfig.historyLimit) {
        history.splice(historyConfig.historyLimit);
      }
      return { ...config, executionHistory: history };
    });
  } catch (error) {
    console.error('Error adding history entry:', error);
    return false;
  }
}

/**
 * getHistoryForCell returns a cell's execution history, newest first.
 */
export function getHistoryForCell(notebookCell: NotebookCell): ExecutionHistoryEntry[] {
  try {
    const history = readCellConfig(notebookCell)?.executionHistory;
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error('Error getting history for cell:', error);
    return [];
  }
}

// withHistory returns a config with its history replaced (or removed when empty)
function withHistory(config: CellConfig, history: ExecutionHistoryEntry[]): CellConfig {
  const next = { ...config };
  if (history.length > 0) {
    next.executionHistory = history;
  } else {
    delete next.executionHistory;
  }
  return next;
}

/**
 * clearHistoryForCell removes all of a cell's execution history.
 */
export function clearHistoryForCell(notebookCell: NotebookCell): boolean {
  try {
    return updateCellConfig(notebookCell, config => withHistory(config, []));
  } catch (error) {
    console.error('Error clearing history for cell:', error);
    return false;
  }
}

/**
 * deleteHistoryEntry removes one entry from a cell's execution history.
 *
 * @returns True if the entry was found and removed
 */
export function deleteHistoryEntry(notebookCell: NotebookCell, entryId: string): boolean {
  try {
    const history = getHistoryForCell(notebookCell);
    if (!history.some(entry => entry.id === entryId)) {
      return false;
    }
    return updateCellConfig(notebookCell, config =>
      withHistory(config, history.filter(entry => entry.id !== entryId)));
  } catch (error) {
    console.error('Error deleting history entry:', error);
    return false;
  }
}
