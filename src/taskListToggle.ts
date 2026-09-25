import * as vscode from 'vscode';
import { ToggleTaskMessage, findTaskMarker, hashCellText } from './notebookRenderer/taskToggle';

/**
 * Applies a checkbox click from the notebook renderer: finds the markdown
 * cell the checkbox was rendered from and flips `[ ]` <-> `[x]` on the
 * clicked line.
 *
 * The edit leaves the notebook dirty, like any other edit; saving writes it
 * back to the markdown file.
 *
 * @returns true if the source was changed
 */
export async function toggleTaskInNotebook(
  notebook: vscode.NotebookDocument,
  message: ToggleTaskMessage
): Promise<boolean> {
  // Identical cells hash the same; either one is a faithful match for the
  // rendered text, so taking the first is fine
  const cell = notebook.getCells().find((c) =>
    c.kind === vscode.NotebookCellKind.Markup && hashCellText(c.document.getText()) === message.cellHash
  );
  if (!cell) {
    console.log(`codebook-md: no markdown cell matches task toggle (hash ${message.cellHash})`);
    return false;
  }

  if (message.line >= cell.document.lineCount) {
    console.log(`codebook-md: task toggle line ${message.line} is past the end of the cell`);
    return false;
  }

  const marker = findTaskMarker(cell.document.lineAt(message.line).text);
  if (!marker) {
    console.log(`codebook-md: line ${message.line} of the cell is not a task list item`);
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    cell.document.uri,
    new vscode.Range(message.line, marker.column, message.line, marker.column + 1),
    marker.checked ? ' ' : 'x'
  );
  return vscode.workspace.applyEdit(edit);
}
