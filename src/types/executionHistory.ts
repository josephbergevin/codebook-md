/**
 * Represents the status of a code block execution
 */
export enum ExecutionStatus {
  Success = 'success',
  Failure = 'failure'
}

/**
 * Represents a single execution history entry for a code block
 */
export interface ExecutionHistoryEntry {
  /**
   * Unique identifier for this history entry
   */
  id: string;

  /**
   * The index of the cell that was executed
   */
  cellIndex: number;

  /**
   * The language of the code block
   */
  languageId: string;

  /**
   * The code content that was executed
   */
  code: string;

  /**
   * The output or result of the execution
   */
  output: string;

  /**
   * The status of the execution (success or failure)
   */
  status: ExecutionStatus;

  /**
   * Timestamp when the execution occurred (ISO 8601 format)
   */
  timestamp: string;

  /**
   * Optional error message if the execution failed
   */
  errorMessage?: string;

  /**
   * Exit code from the execution process (if applicable)
   */
  exitCode?: number;

  /**
   * Duration of the execution in milliseconds (if available)
   */
  duration?: number;
}

/**
 * Represents the complete execution history for a notebook
 */
export interface ExecutionHistory {
  /**
   * Map of cell index to array of execution history entries
   * Key: cell index as string
   * Value: array of ExecutionHistoryEntry ordered by timestamp (newest first)
   */
  [cellIndex: string]: ExecutionHistoryEntry[];
}

/**
 * Configuration options for execution history
 */
export interface ExecutionHistoryConfig {
  /**
   * Whether execution history is enabled
   */
  enabled: boolean;

  /**
   * Maximum number of history entries to retain per cell
   * 0 or undefined means unlimited
   */
  historyLimit: number;
}
