// Setup the mock for vscode first, before any imports
let mockCodeLensEnabled = true;
let mockShowFrontMatter = false;

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn().mockImplementation((section: string) => ({
      get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
        if (section === 'codebook-md.codeLens' && key === 'enabled') return mockCodeLensEnabled;
        if (section === 'codebook-md.frontMatter' && key === 'showInNotebook') return mockShowFrontMatter;
        if (key === 'rootPath') return '';
        if (key === 'notebookConfigPath') return '${notebookPath}.config.json';
        return defaultValue;
      }),
      update: jest.fn(),
    })),
    textDocuments: [],
    workspaceFolders: [],
  },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), clear: jest.fn(), dispose: jest.fn() })),
  },
  commands: { registerCommand: jest.fn(), executeCommand: jest.fn() },
  languages: { registerHoverProvider: jest.fn() },
  NotebookCellKind: { Markup: 1, Code: 2 },
  Range: jest.fn((startLine: number, startChar: number, endLine: number, endChar: number) => ({ startLine, startChar, endLine, endChar })),
  CodeLens: jest.fn((range: unknown, command: unknown) => ({ range, command })),
  EventEmitter: jest.fn(() => ({ event: jest.fn(), fire: jest.fn(), dispose: jest.fn() })),
  NotebookRange: jest.fn(),
  NotebookEditorRevealType: { InCenterIfOutsideViewport: 2 },
}));

import { NotebookCellKind, TextDocument, CodeLens } from 'vscode';
import {
  findRunnableBlocks, resolveCellIndex, RunCodeBlockCodeLensProvider,
  runCodeBlockCommand, openAsNotebookCommand,
} from '../codeLens';

const sample = [
  '# Title',
  '',
  'Some intro text.',
  '',
  '```bash',
  'echo "hello"',
  '```',
  '',
  'A diagram:',
  '',
  '```mermaid',
  'graph TD; A-->B;',
  '```',
  '',
  '```json',
  '{"not": "runnable"}',
  '```',
  '',
  '```go',
  'fmt.Println("hi")',
  '```',
].join('\n');

function textDocument(content: string): TextDocument {
  return { getText: () => content, uri: { path: '/tmp/doc.md' } } as unknown as TextDocument;
}

describe('findRunnableBlocks', () => {
  beforeEach(() => {
    mockShowFrontMatter = false;
  });

  it('returns only executable blocks, with fence lines and notebook cell indices', () => {
    const blocks = findRunnableBlocks(sample);
    expect(blocks.map(b => ({ cellIndex: b.cellIndex, line: b.line, language: b.language }))).toEqual([
      // cells: 0 markdown, 1 bash, 2 markdown, 3 mermaid (markup), 4 json, 5 go
      { cellIndex: 1, line: 4, language: 'shellscript' },
      { cellIndex: 5, line: 18, language: 'go' },
    ]);
    expect(blocks[0].content).toBe('echo "hello"');
  });

  it('resolves fence aliases such as golang, py and postgres', () => {
    const blocks = findRunnableBlocks('```golang\nx\n```\n\n```py\nx\n```\n\n```postgres\nx\n```');
    expect(blocks.map(b => b.language)).toEqual(['go', 'python', 'sql']);
  });

  it('skips the fence line of front matter when computing lines', () => {
    const content = '---\ntitle: x\n---\n\n```bash\necho hi\n```';
    expect(findRunnableBlocks(content)).toEqual([
      expect.objectContaining({ line: 4 }),
    ]);
  });

  it('accounts for a visible front matter cell in the cell index', () => {
    const content = '---\ntitle: x\n---\n\n```bash\necho hi\n```';
    const hidden = findRunnableBlocks(content)[0].cellIndex;
    mockShowFrontMatter = true;
    const shown = findRunnableBlocks(content)[0].cellIndex;
    expect(shown).toBe(hidden + 1);
  });

  it('returns nothing for markdown without runnable blocks', () => {
    expect(findRunnableBlocks('# Just text\n\n```json\n{}\n```')).toEqual([]);
  });
});

describe('RunCodeBlockCodeLensProvider', () => {
  beforeEach(() => {
    mockCodeLensEnabled = true;
    mockShowFrontMatter = false;
  });

  it('adds an open lens at the top and a run lens per runnable block', () => {
    const doc = textDocument(sample);
    const lenses = new RunCodeBlockCodeLensProvider().provideCodeLenses(doc) as unknown as Array<{ range: { startLine: number; }; command: CodeLens['command']; }>;

    expect(lenses).toHaveLength(3);
    expect(lenses[0].range.startLine).toBe(0);
    expect(lenses[0].command?.command).toBe(openAsNotebookCommand);
    expect(lenses[0].command?.arguments).toEqual([doc.uri]);

    expect(lenses[1].range.startLine).toBe(4);
    expect(lenses[1].command?.command).toBe(runCodeBlockCommand);
    expect(lenses[1].command?.arguments).toEqual([doc.uri, 1, 'echo "hello"']);
    expect(lenses[2].range.startLine).toBe(18);
  });

  it('returns no lenses when there is nothing to run', () => {
    expect(new RunCodeBlockCodeLensProvider().provideCodeLenses(textDocument('# Notes'))).toEqual([]);
  });

  it('returns no lenses when disabled in settings', () => {
    mockCodeLensEnabled = false;
    expect(new RunCodeBlockCodeLensProvider().provideCodeLenses(textDocument(sample))).toEqual([]);
  });
});

describe('resolveCellIndex', () => {
  const cell = (kind: NotebookCellKind, text: string) => ({ kind, document: { getText: () => text } });
  const cells = [
    cell(NotebookCellKind.Markup, '# Title'),
    cell(NotebookCellKind.Code, 'echo one'),
    cell(NotebookCellKind.Markup, 'text'),
    cell(NotebookCellKind.Code, 'echo two'),
  ];

  it('uses the given index when that cell matches', () => {
    expect(resolveCellIndex(cells, 3, 'echo two')).toBe(3);
  });

  it('falls back to searching by content when the index is stale', () => {
    expect(resolveCellIndex(cells, 1, 'echo two')).toBe(3);
  });

  it('returns -1 when the block no longer exists', () => {
    expect(resolveCellIndex(cells, 1, 'echo three')).toBe(-1);
  });

  it('rejects a markup cell at the index when no content is given', () => {
    expect(resolveCellIndex(cells, 0)).toBe(-1);
    expect(resolveCellIndex(cells, 1)).toBe(1);
  });
});
