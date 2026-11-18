import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import * as vscode from 'vscode';
import * as config from '../../config';
import { clearDocMetaCache } from '../../docMeta';
import { AiDocsViewProvider, hasAgentDocsContextKey } from '../../webview/aiDocsView';
import { comparablePath } from '../../webview/notebooksViewHtml';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  getAiDocsConfig: jest.fn(),
}));

const mockedConfig = config as jest.Mocked<typeof config>;
const executeCommand = vscode.commands.executeCommand as jest.Mock;

let root: string;
let extensionPath: string;

interface PageState {
  collapsed?: string[];
  filter?: string;
}

interface Page {
  dom: JSDOM;
  document: Document;
  posted: { command: string; filePath?: string; }[];
  state: () => PageState;
}

interface ViewStub {
  visible: boolean;
  webview: { html: string; asWebviewUri: () => { toString: () => string; }; postMessage: jest.Mock; };
}

function write(relativePath: string, content = '# Doc\n'): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function setOpenFile(relativePath: string | undefined): void {
  const state = vscode.window as unknown as { activeTextEditor: unknown; activeNotebookEditor: unknown; };
  state.activeNotebookEditor = undefined;
  state.activeTextEditor = relativePath
    ? { document: { uri: { scheme: 'file', fsPath: path.join(root, relativePath) } } }
    : undefined;
}

/** Creates the provider with a visible view and runs one scan. */
async function openView(): Promise<{ provider: AiDocsViewProvider; view: ViewStub; }> {
  const provider = new AiDocsViewProvider({ extensionPath } as unknown as vscode.ExtensionContext);
  const view: ViewStub = {
    visible: true,
    webview: { html: '', asWebviewUri: () => ({ toString: () => 'codicon.css' }), postMessage: jest.fn() },
  };
  const internals = provider as unknown as { _view: ViewStub; _isViewVisible: boolean; };
  internals._view = view;
  internals._isViewVisible = true;
  await provider.refresh();
  return { provider, view };
}

/** Loads the view's HTML as a page. `saved` is the state the page kept from its last draw. */
function loadPage(html: string, saved?: PageState): Page {
  const posted: Page['posted'] = [];
  let state: PageState = saved ?? {};
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom has no layout, so scrolling a row into view is a no-op here
      window.HTMLElement.prototype.scrollIntoView = () => undefined;
      (window as unknown as { acquireVsCodeApi: unknown; }).acquireVsCodeApi = () => ({
        postMessage: (message: Page['posted'][number]) => posted.push(message),
        getState: () => saved,
        setState: (next: PageState) => { state = next; },
      });
    },
  });
  return { dom, document: dom.window.document, posted, state: () => state };
}

const names = (page: Page, selector: string) => Array.from(page.document.querySelectorAll<HTMLElement>(selector))
  .filter(element => !element.hidden && !element.closest('[hidden]'))
  .map(element => element.textContent ?? '');

function node(page: Page, title: string): HTMLElement {
  const found = Array.from(page.document.querySelectorAll<HTMLElement>('.node'))
    .find(candidate => candidate.querySelector(':scope > .node-row .node-title')?.textContent === title);
  if (!found) {
    throw new Error(`no folder "${title}"`);
  }
  return found;
}

function docRow(page: Page, name: string): HTMLElement {
  const found = Array.from(page.document.querySelectorAll<HTMLElement>('.doc-row'))
    .find(candidate => candidate.querySelector('.row-name')?.textContent === name);
  if (!found) {
    throw new Error(`no row "${name}"`);
  }
  return found;
}

function press(page: Page, key: string): void {
  const target = page.document.activeElement ?? page.document.body;
  target.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function type(page: Page, text: string): void {
  const filter = page.document.getElementById('filter') as HTMLInputElement;
  filter.value = text;
  filter.dispatchEvent(new page.dom.window.Event('input', { bubbles: true }));
}

const focusedName = (page: Page) => {
  const active = page.document.activeElement;
  return active?.querySelector(':scope > .node-row .node-title, :scope > .row-name')?.textContent;
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-aiview-')));
  extensionPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-ext-')));
  const templates = path.join(extensionPath, 'dist', 'templates');
  fs.mkdirSync(templates, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../../webview/templates/aiDocs.html'), path.join(templates, 'aiDocs.html'));

  write('AGENTS.md');
  write('src/AGENTS.md');
  write('src/view.ts', '');
  write('.claude/rules/web.md', '---\npaths: src/**\n---\n');
  write('.agents/skills/docker-cleanup/SKILL.md', '---\nname: docker-cleanup\ndescription: Remove stopped containers.\n---\n');
  write('.agents/skills/release/SKILL.md', '---\nname: release\ndescription: Cut a version.\n---\n');

  (vscode.workspace as unknown as { workspaceFolders: unknown; }).workspaceFolders =
    [{ name: 'repo', uri: { scheme: 'file', fsPath: root } }];
  mockedConfig.getAiDocsConfig.mockReturnValue({ enabled: true, includeUserDocs: false, exclusions: ['node_modules'] });
  executeCommand.mockClear();
  clearDocMetaCache();
  setOpenFile(undefined);
});

afterEach(() => {
  (vscode.workspace as unknown as { workspaceFolders: unknown; }).workspaceFolders = [];
  setOpenFile(undefined);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(extensionPath, { recursive: true, force: true });
});

describe('AiDocsViewProvider', () => {
  test('turns the view on when the workspace has agent docs', async () => {
    await openView();
    expect(executeCommand).toHaveBeenCalledWith('setContext', hasAgentDocsContextKey, true);
  });

  test('turns the view off when the setting is off', async () => {
    mockedConfig.getAiDocsConfig.mockReturnValue({ enabled: false, includeUserDocs: false, exclusions: [] });
    const { provider } = await openView();
    expect(executeCommand).toHaveBeenCalledWith('setContext', hasAgentDocsContextKey, false);
    expect(provider.roots).toEqual([]);
  });

  test('turns the view off for a workspace with no agent docs', async () => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    write('README.md');
    await openView();
    expect(executeCommand).toHaveBeenCalledWith('setContext', hasAgentDocsContextKey, false);
  });

  test('draws the docs grouped by type', async () => {
    const page = loadPage((await openView()).view.webview.html);
    expect(names(page, '.node-title')).toEqual(['Instructions', 'Rules', 'Skills']);
    expect(names(page, '.doc-row .row-name')).toEqual(['Agents', 'Agents', 'Web', 'Docker Cleanup', 'Release']);
  });

  test('opens a listed markdown file as a notebook', async () => {
    const { provider } = await openView();
    const filePath = path.join(root, 'AGENTS.md');
    (provider as unknown as { _handleMessage(message: unknown): void; })._handleMessage({ command: 'openFile', filePath });
    expect(executeCommand).toHaveBeenCalledWith('vscode.openWith', { path: filePath }, 'codebook-md');
  });

  test('ignores a request to open a file the tree does not list', async () => {
    const { provider } = await openView();
    executeCommand.mockClear();
    const handle = (message: unknown) => (provider as unknown as { _handleMessage(message: unknown): void; })._handleMessage(message);
    handle({ command: 'openFile', filePath: path.join(root, 'src', 'view.ts') });
    handle({ command: 'openFile', filePath: 42 });
    handle({ command: 'somethingElse', filePath: path.join(root, 'AGENTS.md') });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('marks the docs that apply to the open file when it draws', async () => {
    setOpenFile('src/view.ts');
    const page = loadPage((await openView()).view.webview.html);
    const applying = Array.from(page.document.querySelectorAll<HTMLElement>('[data-applies="true"]'))
      .map(row => [row.querySelector('.row-name')?.textContent, row.querySelector('.row-hint')?.textContent]);
    expect(applying).toEqual([['Agents', 'workspace root'], ['Agents', 'src'], ['Web', undefined]]);
    expect(page.document.getElementById('legend')?.hidden).toBe(false);
  });
});

describe('the AI Docs page', () => {
  test('puts one item in the Tab order', async () => {
    const page = loadPage((await openView()).view.webview.html);
    const tabStops = Array.from(page.document.querySelectorAll('[role="treeitem"][tabindex="0"]'));
    expect(tabStops).toEqual([node(page, 'Instructions')]);
  });

  test('opens a doc when its row is clicked', async () => {
    const page = loadPage((await openView()).view.webview.html);
    docRow(page, 'Release').click();
    expect(page.posted).toEqual([{ command: 'openFile', filePath: path.join(root, '.agents/skills/release/SKILL.md') }]);
  });

  test('closes and opens a folder when its row is clicked, and remembers it', async () => {
    const page = loadPage((await openView()).view.webview.html);
    const skills = node(page, 'Skills');
    (skills.querySelector('.node-row') as HTMLElement).click();
    expect(skills.getAttribute('aria-expanded')).toBe('false');
    expect(page.state().collapsed).toEqual([skills.dataset.node]);
    (skills.querySelector('.node-row') as HTMLElement).click();
    expect(skills.getAttribute('aria-expanded')).toBe('true');
    expect(page.state().collapsed).toEqual([]);
  });

  test('draws a folder closed when it was closed before the redraw', async () => {
    const html = (await openView()).view.webview.html;
    const key = node(loadPage(html), 'Skills').dataset.node as string;
    const page = loadPage(html, { collapsed: [key] });
    expect(node(page, 'Skills').getAttribute('aria-expanded')).toBe('false');
    expect(node(page, 'Rules').getAttribute('aria-expanded')).toBe('true');
  });

  test('moves through the rows with the arrow keys, Home and End', async () => {
    const page = loadPage((await openView()).view.webview.html);
    node(page, 'Instructions').focus();
    press(page, 'ArrowDown');
    expect(focusedName(page)).toBe('Agents');
    press(page, 'ArrowDown');
    press(page, 'ArrowDown');
    expect(focusedName(page)).toBe('Rules');
    press(page, 'End');
    expect(focusedName(page)).toBe('Release');
    press(page, 'ArrowUp');
    expect(focusedName(page)).toBe('Docker Cleanup');
    press(page, 'Home');
    expect(focusedName(page)).toBe('Instructions');
  });

  test('closes a folder with Left and skips its rows; opens it with Right, then steps in', async () => {
    const page = loadPage((await openView()).view.webview.html);
    const instructions = node(page, 'Instructions');
    instructions.focus();
    press(page, 'ArrowLeft');
    expect(instructions.getAttribute('aria-expanded')).toBe('false');
    press(page, 'ArrowDown');
    expect(focusedName(page)).toBe('Rules');
    press(page, 'ArrowUp');
    press(page, 'ArrowRight');
    expect(instructions.getAttribute('aria-expanded')).toBe('true');
    press(page, 'ArrowRight');
    expect(focusedName(page)).toBe('Agents');
  });

  test('goes from a row to its folder with Left', async () => {
    const page = loadPage((await openView()).view.webview.html);
    docRow(page, 'Release').focus();
    press(page, 'ArrowLeft');
    expect(focusedName(page)).toBe('Skills');
  });

  test('opens a doc with Enter and toggles a folder with Space', async () => {
    const page = loadPage((await openView()).view.webview.html);
    docRow(page, 'Web').focus();
    press(page, 'Enter');
    expect(page.posted).toEqual([{ command: 'openFile', filePath: path.join(root, '.claude/rules/web.md') }]);
    node(page, 'Rules').focus();
    press(page, ' ');
    expect(node(page, 'Rules').getAttribute('aria-expanded')).toBe('false');
  });

  test('filters rows by name or description, hiding folders with no match', async () => {
    const page = loadPage((await openView()).view.webview.html);
    type(page, 'containers');
    expect(names(page, '.doc-row .row-name')).toEqual(['Docker Cleanup']);
    expect(names(page, '.node-title')).toEqual(['Skills']);
    expect(page.document.getElementById('no-match')?.hidden).toBe(true);
    expect(page.state().filter).toBe('containers');
  });

  test('shows matches inside a folder that was closed', async () => {
    const page = loadPage((await openView()).view.webview.html);
    (node(page, 'Skills').querySelector('.node-row') as HTMLElement).click();
    type(page, 'release');
    page.document.getElementById('filter')?.focus();
    press(page, 'ArrowDown');
    press(page, 'ArrowDown');
    expect(focusedName(page)).toBe('Release');
  });

  test('says so when nothing matches, and Escape clears the filter', async () => {
    const page = loadPage((await openView()).view.webview.html);
    type(page, 'zzz');
    expect(names(page, '.doc-row .row-name')).toEqual([]);
    expect(page.document.getElementById('no-match')?.hidden).toBe(false);
    page.document.getElementById('filter')?.focus();
    press(page, 'Escape');
    expect(names(page, '.doc-row .row-name').length).toBe(5);
    expect(page.document.getElementById('no-match')?.hidden).toBe(true);
  });

  test('moves the highlight and the marks when the extension names another open file', async () => {
    const page = loadPage((await openView()).view.webview.html);
    expect(page.document.getElementById('legend')?.hidden).toBe(true);
    const rootAgents = comparablePath(path.join(root, 'AGENTS.md'));
    const srcAgents = comparablePath(path.join(root, 'src', 'AGENTS.md'));
    page.dom.window.dispatchEvent(new page.dom.window.MessageEvent('message', {
      data: { command: 'setOpenFile', activePaths: [srcAgents], appliesPaths: [rootAgents, srcAgents] },
    }));
    const hints = (selector: string) => Array.from(page.document.querySelectorAll(selector)).map(row => row.querySelector('.row-hint')?.textContent);
    expect(hints('[data-active="true"]')).toEqual(['src']);
    expect(hints('[aria-current="true"]')).toEqual(['src']);
    expect(hints('[data-applies="true"]')).toEqual(['workspace root', 'src']);
    expect(page.document.getElementById('legend')?.hidden).toBe(false);
  });

  test('shows the empty state when there are no docs', async () => {
    const template = fs.readFileSync(path.join(extensionPath, 'dist', 'templates', 'aiDocs.html'), 'utf8');
    const page = loadPage(template.replace('{{tree}}', '').replace('{{codiconsCssUri}}', ''));
    expect(page.document.getElementById('no-docs')?.hidden).toBe(false);
    expect(page.document.getElementById('no-match')?.hidden).toBe(true);
  });
});
