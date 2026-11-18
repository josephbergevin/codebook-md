import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import * as vscode from 'vscode';
import * as config from '../../config';
import { clearDocMetaCache } from '../../docMeta';
import { clearRelatedDocsCache } from '../../relatedDocs';
import { NotebooksViewProvider } from '../../webview/notebooksView';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  getDynamicFolderGroupConfig: jest.fn(),
  getWorkspaceFolder: jest.fn(),
  getCodebookConfigFilePath: jest.fn(),
}));

const mockedConfig = config as jest.Mocked<typeof config>;

// File and folder names chosen to break out of a quoted string in a handler
const quoteFile = "it's.md";
const scriptFile = "x');window.hacked=true;('.md";
const quoteFolder = "Joe's";

let root: string;
let extensionPath: string;

interface PostedMessage {
  command: string;
  filePath?: string;
  folderName?: string;
  entry?: { name: string; path: string; };
}

interface WindowState {
  activeTextEditor: unknown;
  activeNotebookEditor: unknown;
}

function write(relativePath: string, content = '# Doc\n'): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function openInEditor(relativePath: string | undefined): void {
  const state = vscode.window as unknown as WindowState;
  state.activeNotebookEditor = undefined;
  if (!relativePath) {
    state.activeTextEditor = undefined;
    return;
  }
  const fsPath = path.join(root, relativePath);
  state.activeTextEditor = { document: { uri: { scheme: 'file', fsPath }, fileName: fsPath } };
}

/** Builds the view's HTML with `currentFile` as the file Related Docs is built around. */
function renderHtml(currentFile: string): string {
  const provider = new NotebooksViewProvider({ extensionPath } as unknown as vscode.ExtensionContext);
  const internals = provider as unknown as {
    _view: unknown;
    _currentEditorFile: string;
    _getWebviewContent(): string;
  };
  internals._view = { webview: { asWebviewUri: () => ({ toString: () => 'codicon.css' }) } };
  internals._currentEditorFile = path.join(root, currentFile);
  return internals._getWebviewContent();
}

/** Loads the view's HTML as a page and collects what it posts to the extension. */
function loadPage(html: string): { dom: JSDOM; posted: PostedMessage[]; } {
  const posted: PostedMessage[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as unknown as { acquireVsCodeApi: unknown; }).acquireVsCodeApi =
        () => ({ postMessage: (message: PostedMessage) => posted.push(message) });
    },
  });
  return { dom, posted };
}

function click(dom: JSDOM, element: Element | null | undefined): void {
  if (!element) {
    throw new Error('expected an element to click');
  }
  element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-view-')));
  extensionPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-ext-')));

  // The provider reads its template from the built extension's dist folder
  const templates = path.join(extensionPath, 'dist', 'templates');
  fs.mkdirSync(templates, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../../webview/templates/notebooks.html'), path.join(templates, 'notebooks.html'));

  write('README.md');
  write(quoteFile);
  write(scriptFile);
  write('.agents/skills/deploy/SKILL.md', '---\nname: deploy\n---\n');
  write(".agents/skills/deploy/don't.sh", '#!/bin/sh\n');
  write('docs/guide.md');

  // A folder group built by hand, with the same awkward names
  write('.vscode/codebook-md.json', JSON.stringify({
    folderGroups: [{
      name: 'Workspace',
      description: '',
      icon: '',
      hide: false,
      folders: [{
        name: quoteFolder,
        hide: false,
        folders: [],
        files: [
          { name: "It's", path: quoteFile },
          { name: 'Guide', path: 'docs/guide.md' },
        ],
      }],
    }],
  }));

  mockedConfig.getWorkspaceFolder.mockReturnValue(root);
  mockedConfig.getCodebookConfigFilePath.mockReturnValue(path.join(root, '.vscode', 'codebook-md.json'));
  mockedConfig.getDynamicFolderGroupConfig.mockReturnValue({
    enabled: true,
    name: 'Related Docs',
    description: 'For the current file',
    subFolderInclusions: [],
    exclusions: ['node_modules'],
    includeAgentDocs: true,
    placeRulesByScope: true,
  });
  clearRelatedDocsCache();
  clearDocMetaCache();
  openInEditor(undefined);
});

afterEach(() => {
  openInEditor(undefined);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(extensionPath, { recursive: true, force: true });
});

describe('NotebooksViewProvider rows', () => {
  test('keep file and folder names out of click handlers', () => {
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    const handlers = Array.from(dom.window.document.querySelectorAll('[onclick]'))
      .map(element => element.getAttribute('onclick') ?? '');
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(handler).not.toContain(quoteFile);
      expect(handler).not.toContain('hacked');
      expect(handler).not.toContain(quoteFolder);
      expect(handler).not.toContain('.md');
      expect(handler).not.toContain('.sh');
    }
  });

  test('open a file whose name has an apostrophe', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const rows = Array.from(dom.window.document.querySelectorAll<HTMLElement>('#dynamic-folder-group .file'));
    click(dom, rows.find(row => row.dataset.itemPath === quoteFile));
    expect(posted).toEqual([{ command: 'openFile', filePath: quoteFile }]);
  });

  test('treat a file name written as script as a plain path', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const rows = Array.from(dom.window.document.querySelectorAll<HTMLElement>('#dynamic-folder-group .file'));
    click(dom, rows.find(row => row.dataset.itemPath === scriptFile));
    expect(posted).toEqual([{ command: 'openFile', filePath: scriptFile }]);
    expect((dom.window as unknown as { hacked?: boolean; }).hacked).toBeUndefined();
  });

  test('open a skill from its name, and its bundled files from their rows', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const document = dom.window.document;
    click(dom, document.querySelector('.doc-folder-name'));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.doc-folder .file'));
    click(dom, rows.find(row => (row.dataset.itemPath ?? '').endsWith("don't.sh")));
    expect(posted).toEqual([
      { command: 'openFile', filePath: '.agents/skills/deploy/SKILL.md' },
      { command: 'openFile', filePath: ".agents/skills/deploy/don't.sh" },
    ]);
  });

  test('open and rename a file in a folder group built by hand', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const row = Array.from(dom.window.document.querySelectorAll<HTMLElement>('#folder-group-1 .file'))
      .find(candidate => candidate.dataset.itemPath === quoteFile);
    click(dom, row);
    click(dom, row?.querySelector('button[title="Rename"]'));
    expect(posted).toEqual([
      { command: 'openFile', filePath: quoteFile },
      { command: 'renameFile', entry: { name: "It's", path: quoteFile } },
    ]);
  });

  test('rename a folder whose name has an apostrophe', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    click(dom, dom.window.document.querySelector('#folder-group-1 .folder-header button[title="Rename"]'));
    expect(posted).toEqual([{ command: 'renameFolder', folderName: quoteFolder, currentName: quoteFolder }]);
  });
});

describe('NotebooksViewProvider scoped rules', () => {
  const ruleRow = (dom: JSDOM, name: string) => Array.from(dom.window.document.querySelectorAll<HTMLElement>('#dynamic-folder-group .file'))
    .find(row => row.querySelector('.file-name')?.textContent === name);

  beforeEach(() => {
    write('.github/instructions/docs.instructions.md', '---\napplyTo: "docs/**"\n---\n');
    write('.github/instructions/go.instructions.md', '---\napplyTo: "docs/**/*.go, src/**"\n---\n');
  });

  test('show what they are scoped to', () => {
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    expect(ruleRow(dom, 'Docs Instructions')?.querySelector('.scope-chip')?.textContent).toBe('docs/**');
    expect(ruleRow(dom, 'Go Instructions')?.querySelector('.scope-chip')?.textContent).toBe('docs/**/*.go +1');
  });

  test('are marked when their scope covers the file the tree is built around', () => {
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    expect(ruleRow(dom, 'Docs Instructions')?.querySelector('.applies-mark')).not.toBeNull();
    expect(ruleRow(dom, 'Go Instructions')?.querySelector('.applies-mark')).toBeNull();
  });

  test('sit under the folder they apply to', () => {
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    const folderName = ruleRow(dom, 'Docs Instructions')?.closest('.folder')?.querySelector('.folder-name')?.textContent;
    expect(folderName).toBe('Docs');
  });
});

describe('NotebooksViewProvider open file', () => {
  const activeRows = (dom: JSDOM) => Array.from(dom.window.document.querySelectorAll<HTMLElement>('[data-active="true"]'))
    .map(row => row.dataset.itemPath ?? row.querySelector<HTMLElement>('[data-item-path]')?.dataset.itemPath);

  test('marks the open file\'s row in every group that lists it', () => {
    openInEditor('docs/guide.md');
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    expect(activeRows(dom)).toEqual(['docs/guide.md', 'docs/guide.md']);
  });

  test('marks nothing when no file is open', () => {
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    expect(activeRows(dom)).toEqual([]);
  });

  test('moves the mark when the extension names another file, opening the skill that holds it', () => {
    openInEditor('docs/guide.md');
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    const document = dom.window.document;
    const script = Array.from(document.querySelectorAll<HTMLElement>('.doc-folder .file'))
      .find(row => (row.dataset.itemPath ?? '').endsWith("don't.sh"));
    expect(script?.closest('.folder-content')?.classList.contains('hidden')).toBe(true);

    // jsdom has no layout, so scrolling a row into view is a no-op here
    dom.window.HTMLElement.prototype.scrollIntoView = jest.fn();
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { command: 'setActiveFile', paths: [script?.dataset.abs] },
    }));

    expect(activeRows(dom)).toEqual([".agents/skills/deploy/don't.sh"]);
    expect(script?.closest('.folder-content')?.classList.contains('hidden')).toBe(false);
  });
});
