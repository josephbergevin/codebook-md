import * as vscode from 'vscode';
import {
  MARKDOWN_RENDERER_ID,
  ToggleTaskMessage,
  findTaskMarker,
  hashCellText,
  isToggleTaskMessage,
} from './notebookRenderer/taskToggle';

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

/**
 * Listens for checkbox clicks from the CodebookMD notebook renderer.
 * The renderer extends VS Code's shared markdown renderer, so this also
 * handles clicks in markdown cells of other notebook types.
 */
export function registerTaskListToggle(context: vscode.ExtensionContext): void {
  const messaging = vscode.notebooks.createRendererMessaging(MARKDOWN_RENDERER_ID);
  context.subscriptions.push(
    messaging.onDidReceiveMessage(async ({ editor, message }) => {
      if (!isToggleTaskMessage(message)) {
        return;
      }
      try {
        await toggleTaskInNotebook(editor.notebook, message);
      } catch (error) {
        console.log('codebook-md: failed to toggle task list item', error);
        vscode.window.showErrorMessage(`CodebookMD: couldn't update the checkbox: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
}
