import * as vscode from 'vscode';
import { toggleTaskInNotebook } from '../taskListToggle';
import { hashCellText } from '../notebookRenderer/taskToggle';

/**
 * Builds a minimal notebook cell backed by the given text.
 */
function fakeCell(text: string, kind: number = vscode.NotebookCellKind.Markup): vscode.NotebookCell {
  const lines = text.split('\n');
  return {
    kind,
    document: {
      uri: { path: `cell-${hashCellText(text)}` },
      getText: () => text,
      lineCount: lines.length,
      lineAt: (line: number) => ({ text: lines[line] }),
    },
  } as unknown as vscode.NotebookCell;
}

function fakeNotebook(cells: vscode.NotebookCell[]): vscode.NotebookDocument {
  return { getCells: () => cells } as unknown as vscode.NotebookDocument;
}

/**
 * Returns the edits passed to the most recent workspace.applyEdit call.
 */
function lastEdits(): { uri: unknown; range: unknown; newText: string }[] {
  const calls = (vscode.workspace.applyEdit as jest.Mock).mock.calls;
  return calls[calls.length - 1][0].edits;
}

describe('toggleTaskInNotebook', () => {
  beforeEach(() => {
    (vscode.workspace.applyEdit as jest.Mock).mockClear();
    // The no-match paths log why they skipped; keep test output clean
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when the cell and line match', () => {
    const text = 'Todo:\n\n- [ ] first\n- [x] second';
    const cell = fakeCell(text);
    const notebook = fakeNotebook([cell]);

    test('checks an unchecked item', async () => {
      await toggleTaskInNotebook(notebook, { type: 'toggleTask', cellHash: hashCellText(text), line: 2 });
      expect(lastEdits()).toEqual([{
        uri: cell.document.uri,
        range: { start: { line: 2, character: 3 }, end: { line: 2, character: 4 } },
        newText: 'x',
      }]);
    });

    test('unchecks a checked item', async () => {
      await toggleTaskInNotebook(notebook, { type: 'toggleTask', cellHash: hashCellText(text), line: 3 });
      expect(lastEdits()[0].newText).toBe(' ');
    });

    test('reports that the source changed', async () => {
      const changed = await toggleTaskInNotebook(notebook, { type: 'toggleTask', cellHash: hashCellText(text), line: 2 });
      expect(changed).toBe(true);
    });
  });

  test('edits the cell whose text matches, not the first markdown cell', async () => {
    const other = fakeCell('- [ ] other');
    const target = fakeCell('- [ ] target');
    await toggleTaskInNotebook(fakeNotebook([other, target]), {
      type: 'toggleTask', cellHash: hashCellText('- [ ] target'), line: 0,
    });
    expect(lastEdits()[0].uri).toBe(target.document.uri);
  });

  test('ignores code cells with matching text', async () => {
    const code = fakeCell('- [ ] task', vscode.NotebookCellKind.Code);
    const changed = await toggleTaskInNotebook(fakeNotebook([code]), {
      type: 'toggleTask', cellHash: hashCellText('- [ ] task'), line: 0,
    });
    expect(changed).toBe(false);
  });

  test('does nothing when no cell matches (the cell changed since rendering)', async () => {
    const changed = await toggleTaskInNotebook(fakeNotebook([fakeCell('- [ ] edited')]), {
      type: 'toggleTask', cellHash: hashCellText('- [ ] original'), line: 0,
    });
    expect(changed).toBe(false);
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  test('does nothing when the line is not a task item', async () => {
    const text = 'Intro\n- [ ] task';
    const changed = await toggleTaskInNotebook(fakeNotebook([fakeCell(text)]), {
      type: 'toggleTask', cellHash: hashCellText(text), line: 0,
    });
    expect(changed).toBe(false);
  });

  test('does nothing when the line is past the end of the cell', async () => {
    const text = '- [ ] task';
    const changed = await toggleTaskInNotebook(fakeNotebook([fakeCell(text)]), {
      type: 'toggleTask', cellHash: hashCellText(text), line: 5,
    });
    expect(changed).toBe(false);
  });
});
