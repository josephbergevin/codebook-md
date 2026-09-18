import {
  CodeLens, CodeLensProvider, commands, Event, EventEmitter, NotebookCellKind,
  NotebookEditor, NotebookEditorRevealType, NotebookRange, Range, TextDocument, Uri,
  window, workspace,
} from 'vscode';
import * as codebook from './codebook';
import * as config from './config';

export const runCodeBlockCommand = 'codebook-md.runCodeBlockInNotebook';
export const openAsNotebookCommand = 'codebook-md.openAsNotebook';

/**
 * A fenced code block in a markdown file that CodebookMD can execute.
 */
export interface RunnableBlock {
  // cellIndex is the index of the block's cell once the file is opened as a notebook
  cellIndex: number;
  // line is the 0-based line of the block's opening ``` fence
  line: number;
  language: string;
  content: string;
}

/**
 * findRunnableBlocks lists the executable code blocks in a markdown document.
 *
 * It runs the same parser the notebook serializer uses, so each block's cellIndex
 * is exactly the index of its cell in the opened notebook.
 */
export function findRunnableBlocks(content: string): RunnableBlock[] {
  const blocks: RunnableBlock[] = [];
  codebook.parseMarkdown(content).forEach((cell, cellIndex) => {
    if (cell.kind !== NotebookCellKind.Code || cell.startLine === undefined) {
      return;
    }
    if (!codebook.isExecutableLanguage(cell.language)) {
      return;
    }
    blocks.push({ cellIndex, line: cell.startLine, language: cell.language, content: cell.content });
  });
  return blocks;
}

/**
 * RunCodeBlockCodeLensProvider adds "Run in CodebookMD" above each executable code
 * block, and "Open as CodebookMD Notebook" at the top of the file, when a markdown
 * file is open in the plain text editor.
 */
export class RunCodeBlockCodeLensProvider implements CodeLensProvider {
  private readonly changeEmitter = new EventEmitter<void>();
  readonly onDidChangeCodeLenses: Event<void> = this.changeEmitter.event;

  /** refresh asks VS Code to re-query the lenses, e.g. after a settings change. */
  refresh(): void {
    this.changeEmitter.fire();
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    if (!config.isCodeLensEnabled()) {
      return [];
    }

    const blocks = findRunnableBlocks(document.getText());
    if (blocks.length === 0) {
      return [];
    }

    const lenses: CodeLens[] = [
      new CodeLens(new Range(0, 0, 0, 0), {
        title: '$(notebook) Open as CodebookMD Notebook',
        tooltip: 'Open this markdown file as a runnable notebook',
        command: openAsNotebookCommand,
        arguments: [document.uri],
      }),
    ];
    for (const block of blocks) {
      lenses.push(new CodeLens(new Range(block.line, 0, block.line, 0), {
        title: '$(play) Run in CodebookMD',
        tooltip: `Open as a notebook and run this ${block.language} block`,
        command: runCodeBlockCommand,
        arguments: [document.uri, block.cellIndex, block.content],
      }));
    }
    return lenses;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

/**
 * openAsNotebook opens a markdown file in the CodebookMD notebook editor. With no
 * uri it uses the markdown file in the active text editor.
 */
export async function openAsNotebook(uri?: Uri): Promise<NotebookEditor | undefined> {
  const target = uri ?? window.activeTextEditor?.document.uri;
  if (!target) {
    window.showWarningMessage('Codebook: open a markdown file first.');
    return undefined;
  }

  // The notebook is loaded from disk, so unsaved edits in the text editor would
  // otherwise be missing from it
  const textDocument = workspace.textDocuments.find(d => d.uri.toString() === target.toString());
  if (textDocument?.isDirty) {
    await textDocument.save();
  }

  await commands.executeCommand('vscode.openWith', target, 'codebook-md');
  return window.visibleNotebookEditors.find(e => e.notebook.uri.toString() === target.toString())
    ?? window.activeNotebookEditor;
}

/**
 * resolveCellIndex returns the index of the code cell holding a block. It trusts
 * cellIndex when that cell's source matches, and otherwise falls back to searching
 * by source, since the notebook may have been edited after the lens was computed.
 * Returns -1 when the block cannot be found.
 */
export function resolveCellIndex(
  cells: ReadonlyArray<{ kind: NotebookCellKind; document: { getText(): string; }; }>,
  cellIndex: number,
  expectedContent?: string,
): number {
  const matches = (i: number): boolean => {
    const cell = cells[i];
    return cell !== undefined
      && cell.kind === NotebookCellKind.Code
      && (expectedContent === undefined || cell.document.getText() === expectedContent);
  };
  if (matches(cellIndex)) {
    return cellIndex;
  }
  if (expectedContent === undefined) {
    return -1;
  }
  return cells.findIndex((_, i) => matches(i));
}

/**
 * runCodeBlockInNotebook opens a markdown file as a notebook, then reveals and
 * executes the cell for one of its code blocks.
 */
export async function runCodeBlockInNotebook(uri: Uri, cellIndex: number, expectedContent?: string): Promise<void> {
  const editor = await openAsNotebook(uri);
  if (!editor) {
    window.showErrorMessage('Codebook: could not open the file as a notebook.');
    return;
  }

  const index = resolveCellIndex(editor.notebook.getCells(), cellIndex, expectedContent);
  if (index < 0) {
    window.showWarningMessage('Codebook: could not find that code block in the notebook - it may have changed. Run it from the notebook instead.');
    return;
  }

  const range = new NotebookRange(index, index + 1);
  editor.selections = [range];
  editor.revealRange(range, NotebookEditorRevealType.InCenterIfOutsideViewport);
  await commands.executeCommand('notebook.cell.execute', {
    ranges: [{ start: index, end: index + 1 }],
    document: editor.notebook.uri,
  });
}
