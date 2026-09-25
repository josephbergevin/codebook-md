import { commands, TabInputText, Uri, window } from 'vscode';
import { openAsNotebook } from './codeLens';

/** Notebook type CodebookMD registers for markdown files */
const notebookType = 'codebook-md';

/**
 * Switches the active CodebookMD notebook to the plain text editor, in the
 * same tab.
 * @returns false when there is no CodebookMD notebook to switch
 */
export async function switchToText(): Promise<boolean> {
  const notebook = window.activeNotebookEditor?.notebook;
  if (!notebook || notebook.notebookType !== notebookType) {
    return false;
  }
  // Replaces the notebook editor with the text editor in the same tab
  await commands.executeCommand('workbench.action.reopenTextEditor');
  return true;
}

/**
 * Switches a markdown file from the text editor to the CodebookMD notebook,
 * in the same tab.
 *
 * Opening the notebook can add an editor next to the text editor rather
 * than replacing it, so any text editor tab left behind is closed. Otherwise
 * switching back and forth would leave a growing row of tabs for one file.
 * openAsNotebook saves unsaved text edits first, so closing loses nothing.
 *
 * @param uri the file to switch; defaults to the active text editor's file
 * @returns false when there is no markdown file to switch
 */
export async function switchToNotebook(uri?: Uri): Promise<boolean> {
  const target = uri ?? window.activeTextEditor?.document.uri;
  if (!target) {
    return false;
  }

  // The notebook opens in the active group, and takes focus
  const column = window.tabGroups.activeTabGroup.viewColumn;

  const editor = await openAsNotebook(target);
  if (!editor) {
    return false;
  }

  // Look the tab up afresh: if VS Code replaced the text editor itself,
  // there's nothing left to close
  const group = window.tabGroups.all.find((g) => g.viewColumn === column);
  const textTab = group?.tabs.find((tab) =>
    tab.input instanceof TabInputText && tab.input.uri.toString() === target.toString()
  );
  if (textTab && !textTab.isDirty) {
    await window.tabGroups.close(textTab, true);
  }
  return true;
}

/**
 * Flips the active markdown file between the CodebookMD notebook and the
 * plain text editor.
 */
export async function toggleView(): Promise<void> {
  if (await switchToText()) {
    return;
  }

  const document = window.activeTextEditor?.document;
  if (document?.languageId === 'markdown') {
    await switchToNotebook(document.uri);
    return;
  }

  window.showInformationMessage('CodebookMD: open a markdown file or a CodebookMD notebook to switch views.');
}
