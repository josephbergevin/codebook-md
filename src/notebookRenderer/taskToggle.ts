/**
 * Pieces of the task-list toggle protocol shared by the notebook renderer
 * (webview side) and the extension host. Nothing here may import `vscode`
 * or touch the DOM, since both sides bundle this file.
 */

/**
 * Message the renderer posts when a task list checkbox is clicked.
 */
export interface ToggleTaskMessage {
  type: 'toggleTask';
  /** `hashCellText()` of the markdown cell the checkbox was rendered from */
  cellHash: string;
  /** 0-based line of the task item within that cell */
  line: number;
}

/**
 * Checks that an incoming renderer message is a well-formed toggle request.
 */
export function isToggleTaskMessage(message: unknown): message is ToggleTaskMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const m = message as Record<string, unknown>;
  return m.type === 'toggleTask'
    && typeof m.cellHash === 'string'
    && typeof m.line === 'number'
    && Number.isInteger(m.line)
    && m.line >= 0;
}

/**
 * Hashes a markdown cell's text so a click in the renderer can be matched to
 * the cell it came from. The renderer only knows a webview-internal id for
 * the cell, which the extension host cannot map back to a NotebookCell.
 *
 * The text is normalized the same way markdown-it normalizes its input
 * (CRLF/CR to LF, NUL to U+FFFD) so both sides hash identical strings.
 * FNV-1a (32-bit) is plenty: it only has to tell apart the markdown
 * cells of one notebook.
 */
export function hashCellText(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\0/g, '�');
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Matches the start of a task list line: optional blockquote markers, the
 * list marker (`-`, `*`, `+`, `1.` or `1)`), then `[ ]`, `[x]` or `[X]`.
 */
const TASK_LINE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]/;

/**
 * Location of the state character inside a task marker on one line.
 */
export interface TaskMarker {
  /** Column of the character between the brackets */
  column: number;
  checked: boolean;
}

/**
 * Finds the task marker on a line of markdown source.
 * @returns the marker, or undefined when the line is not a task list item
 */
export function findTaskMarker(lineText: string): TaskMarker | undefined {
  const match = TASK_LINE.exec(lineText);
  if (!match) {
    return undefined;
  }
  return {
    column: match[1].length + 1,
    checked: match[2] !== ' ',
  };
}
