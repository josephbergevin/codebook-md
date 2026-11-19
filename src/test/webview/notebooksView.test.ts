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
  getWorkspaceFolderFor: jest.fn(),
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
  key?: string;
  value?: unknown;
  index?: number;
  patch?: Record<string, unknown>;
  groupId?: string;
}

interface WindowState {
  activeTextEditor: unknown;
  activeNotebookEditor: unknown;
}

function dynamicSettings(overrides: Partial<config.DynamicFolderGroupConfig> = {}): void {
  mockedConfig.getDynamicFolderGroupConfig.mockReturnValue({
    enabled: true,
    name: 'Related Docs',
    description: 'For the current file',
    subFolderInclusions: [],
    exclusions: ['node_modules'],
    includeAgentDocs: true,
    placeRulesByScope: true,
    startCollapsed: false,
    icon: '',
    position: 0,
    hiddenDocTypes: [],
    ...overrides,
  });
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

interface PageState {
  groups?: Record<string, { collapsed: boolean; start: boolean; }>;
  drawer?: string | null;
  focus?: string | null;
}

interface Page {
  dom: JSDOM;
  posted: PostedMessage[];
  // What the page has asked the editor to remember
  state: () => PageState;
}

/**
 * Loads the view's HTML as a page and collects what it posts to the extension.
 * `saved` is the state the page kept from its last draw.
 */
function loadPage(html: string, saved?: PageState): Page {
  const posted: PostedMessage[] = [];
  let state: PageState = saved ?? {};
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom has no layout, so scrolling a row into view is a no-op here
      window.HTMLElement.prototype.scrollIntoView = () => undefined;
      (window as unknown as { acquireVsCodeApi: unknown; }).acquireVsCodeApi = () => ({
        postMessage: (message: PostedMessage) => posted.push(message),
        getState: () => saved,
        setState: (next: PageState) => { state = JSON.parse(JSON.stringify(next)); },
      });
    },
  });
  return { dom, posted, state: () => state };
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
  mockedConfig.getWorkspaceFolderFor.mockReturnValue(root);
  mockedConfig.getCodebookConfigFilePath.mockReturnValue(path.join(root, '.vscode', 'codebook-md.json'));
  dynamicSettings();
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
    click(dom, rows.find(row => row.dataset.itemPath === path.join(root, quoteFile)));
    expect(posted).toEqual([{ command: 'openFile', filePath: path.join(root, quoteFile) }]);
  });

  test('treat a file name written as script as a plain path', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const rows = Array.from(dom.window.document.querySelectorAll<HTMLElement>('#dynamic-folder-group .file'));
    click(dom, rows.find(row => row.dataset.itemPath === path.join(root, scriptFile)));
    expect(posted).toEqual([{ command: 'openFile', filePath: path.join(root, scriptFile) }]);
    expect((dom.window as unknown as { hacked?: boolean; }).hacked).toBeUndefined();
  });

  test('open a skill from its name, and its bundled files from their rows', () => {
    const { dom, posted } = loadPage(renderHtml('docs/guide.md'));
    const document = dom.window.document;
    click(dom, document.querySelector('.doc-folder-name'));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.doc-folder .file'));
    click(dom, rows.find(row => (row.dataset.itemPath ?? '').endsWith("don't.sh")));
    expect(posted).toEqual([
      { command: 'openFile', filePath: path.join(root, '.agents/skills/deploy/SKILL.md') },
      { command: 'openFile', filePath: path.join(root, ".agents/skills/deploy/don't.sh") },
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
    // Generated rows carry absolute paths; rows in a group built by hand keep theirs
    expect(activeRows(dom)).toEqual([path.join(root, 'docs/guide.md'), 'docs/guide.md']);
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

    expect(activeRows(dom)).toEqual([path.join(root, ".agents/skills/deploy/don't.sh")]);
    expect(script?.closest('.folder-content')?.classList.contains('hidden')).toBe(false);
  });
});

describe('NotebooksViewProvider groups', () => {
  const groupIds = (page: Page) => Array.from(page.dom.window.document.querySelectorAll('.folder-group')).map(group => group.id);
  const folderGroup = (name: string, extra: object = {}) => ({ name, description: '', icon: '', hide: false, folders: [], ...extra });

  function writeGroups(groups: object[]): void {
    write('.vscode/codebook-md.json', JSON.stringify({ folderGroups: groups }));
  }

  test('lists the generated group first by default', () => {
    writeGroups([folderGroup('Workspace'), folderGroup('Runbooks')]);
    expect(groupIds(loadPage(renderHtml('docs/guide.md')))).toEqual(['dynamic-folder-group', 'folder-group-1', 'folder-group-2']);
  });

  test('lists the generated group where the settings place it', () => {
    writeGroups([folderGroup('Workspace'), folderGroup('Runbooks')]);
    dynamicSettings({ position: 1 });
    expect(groupIds(loadPage(renderHtml('docs/guide.md')))).toEqual(['folder-group-1', 'dynamic-folder-group', 'folder-group-2']);
    dynamicSettings({ position: 7 });
    expect(groupIds(loadPage(renderHtml('docs/guide.md')))).toEqual(['folder-group-1', 'folder-group-2', 'dynamic-folder-group']);
  });

  test('counts a hidden group when placing the generated one', () => {
    writeGroups([folderGroup('Workspace', { hide: true }), folderGroup('Runbooks')]);
    dynamicSettings({ position: 1 });
    expect(groupIds(loadPage(renderHtml('docs/guide.md')))).toEqual(['dynamic-folder-group', 'folder-group-2']);
  });

  test('starts a group collapsed when its option says so', () => {
    writeGroups([folderGroup('Workspace', { collapsed: true }), folderGroup('Runbooks')]);
    dynamicSettings({ startCollapsed: true });
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    const collapsed = Array.from(dom.window.document.querySelectorAll('.folder-group.collapsed')).map(group => group.id);
    expect(collapsed).toEqual(['dynamic-folder-group', 'folder-group-1']);
  });

  test('shows a group\'s icon, and ignores one that is not a codicon name', () => {
    writeGroups([folderGroup('Workspace', { icon: 'rocket' }), folderGroup('Runbooks', { icon: '"><img src=x>' })]);
    dynamicSettings({ icon: 'compass' });
    const { dom } = loadPage(renderHtml('docs/guide.md'));
    const icons = Array.from(dom.window.document.querySelectorAll('.folder-group')).map(group => group.querySelector('.group-icon')?.className);
    expect(icons).toEqual(['codicon codicon-compass group-icon', 'codicon codicon-rocket group-icon', undefined]);
    expect(dom.window.document.querySelector('img')).toBeNull();
  });
});

describe('NotebooksViewProvider drawers', () => {
  const drawer = (page: Page, groupId: string) => page.dom.window.document.querySelector<HTMLElement>(`#${groupId} > [data-drawer]`);
  const gear = (page: Page, groupId: string) => page.dom.window.document.querySelector<HTMLElement>(`#${groupId} .gear-button`);

  function change(page: Page, input: HTMLInputElement | null | undefined): void {
    if (!input) {
      throw new Error('expected an input');
    }
    input.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
  }

  test('open under the header from the gear, one at a time', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    expect(drawer(page, 'dynamic-folder-group')?.hidden).toBe(true);

    click(page.dom, gear(page, 'dynamic-folder-group'));
    expect(drawer(page, 'dynamic-folder-group')?.hidden).toBe(false);
    expect(gear(page, 'dynamic-folder-group')?.getAttribute('aria-expanded')).toBe('true');
    // The gear sits in the header; opening the drawer does not collapse the group
    expect(page.dom.window.document.getElementById('dynamic-folder-group')?.classList.contains('collapsed')).toBe(false);

    click(page.dom, gear(page, 'folder-group-1'));
    expect(drawer(page, 'dynamic-folder-group')?.hidden).toBe(true);
    expect(drawer(page, 'folder-group-1')?.hidden).toBe(false);

    click(page.dom, gear(page, 'folder-group-1'));
    expect(drawer(page, 'folder-group-1')?.hidden).toBe(true);
    expect(page.state().drawer).toBeNull();
  });

  test('a switch in the generated group\'s drawer changes its setting', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const input = drawer(page, 'dynamic-folder-group')?.querySelector<HTMLInputElement>('[data-setting="dynamicFolderGroup.includeAgentDocs"]');
    expect(input?.checked).toBe(true);
    (input as HTMLInputElement).checked = false;
    change(page, input);
    expect(page.posted).toEqual([{ command: 'setSetting', key: 'dynamicFolderGroup.includeAgentDocs', value: false }]);
    expect(page.state().focus).toBe('dynamicFolderGroup.includeAgentDocs');
  });

  test('folders to look inside are added and removed as a whole list', () => {
    dynamicSettings({ subFolderInclusions: ['.github', "it's"] });
    const page = loadPage(renderHtml('docs/guide.md'));
    const chips = drawer(page, 'dynamic-folder-group')?.querySelector<HTMLElement>('.chips');
    expect(Array.from(chips?.querySelectorAll('.chip-text') ?? []).map(chip => chip.textContent)).toEqual(['.github', "it's"]);

    const input = chips?.querySelector<HTMLInputElement>('.chip-input') as HTMLInputElement;
    input.value = ' tooling/** ';
    input.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    click(page.dom, chips?.querySelector('.chip-remove[data-value=".github"]'));
    expect(page.posted).toEqual([
      { command: 'setSetting', key: 'dynamicFolderGroup.subFolderInclusions', value: ['.github', "it's", 'tooling/**'] },
      { command: 'setSetting', key: 'dynamicFolderGroup.subFolderInclusions', value: ["it's"] },
    ]);
  });

  test('a hand-built group is renamed, collapsed and hidden from its drawer', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const fields = drawer(page, 'folder-group-1');
    const name = fields?.querySelector<HTMLInputElement>('[data-field="name"]') as HTMLInputElement;
    expect(name.value).toBe('Workspace');
    click(page.dom, gear(page, 'folder-group-1'));

    name.value = "Joe's docs";
    change(page, name);
    const collapsed = fields?.querySelector<HTMLInputElement>('[data-field="collapsed"]') as HTMLInputElement;
    collapsed.checked = true;
    change(page, collapsed);
    expect(page.posted).toEqual([
      { command: 'updateGroup', index: 0, patch: { name: "Joe's docs" } },
      { command: 'updateGroup', index: 0, patch: { collapsed: true } },
    ]);
    // The open drawer is remembered under the group's new name
    expect(page.state().drawer).toBe("group:Joe's docs");

    click(page.dom, Array.from(fields?.querySelectorAll('button') ?? []).find(button => button.textContent === 'Hide group'));
    expect(page.posted[2]).toEqual({ command: 'updateGroup', index: 0, patch: { hide: true } });
    expect(page.state().drawer).toBeNull();
  });

  test('link to the full settings for their group', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const link = (groupId: string) => Array.from(drawer(page, groupId)?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === 'All settings');
    click(page.dom, link('dynamic-folder-group'));
    click(page.dom, link('folder-group-1'));
    expect(page.posted).toEqual([
      { command: 'openSideBarSettings', groupId: 'related' },
      { command: 'openSideBarSettings', groupId: 'group:0' },
    ]);
  });

  test('stay open, with the control in use focused, when the view is redrawn', () => {
    const page = loadPage(renderHtml('docs/guide.md'), { drawer: 'related', focus: 'dynamicFolderGroup.startCollapsed' });
    expect(drawer(page, 'dynamic-folder-group')?.hidden).toBe(false);
    expect(gear(page, 'dynamic-folder-group')?.getAttribute('aria-expanded')).toBe('true');
    expect((page.dom.window.document.activeElement as HTMLElement).dataset.setting).toBe('dynamicFolderGroup.startCollapsed');
    // Focus is given back once, not on every later draw
    expect(page.state().focus).toBeNull();
  });

  test('forget a drawer whose group is gone', () => {
    const page = loadPage(renderHtml('docs/guide.md'), { drawer: 'group:Deleted', focus: 'group:3:name' });
    expect(page.dom.window.document.querySelectorAll('[data-drawer]:not([hidden])')).toHaveLength(0);
    expect(page.state()).toMatchObject({ drawer: null, focus: null });
  });
});

describe('NotebooksViewProvider remembered groups', () => {
  const isCollapsed = (page: Page, id: string) => page.dom.window.document.getElementById(id)?.classList.contains('collapsed');

  test('remember a group closed by hand', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    click(page.dom, page.dom.window.document.querySelector('#dynamic-folder-group .folder-group-header'));
    expect(page.state().groups).toEqual({ related: { collapsed: true, start: false } });

    const redrawn = loadPage(renderHtml('docs/guide.md'), page.state());
    expect(isCollapsed(redrawn, 'dynamic-folder-group')).toBe(true);
    expect(isCollapsed(redrawn, 'folder-group-1')).toBe(false);
  });

  test('keep a group opened by hand open although it starts collapsed', () => {
    dynamicSettings({ startCollapsed: true });
    const page = loadPage(renderHtml('docs/guide.md'), { groups: { related: { collapsed: false, start: true } } });
    expect(isCollapsed(page, 'dynamic-folder-group')).toBe(false);
  });

  test('follow the option again once it changes', () => {
    dynamicSettings({ startCollapsed: true });
    const page = loadPage(renderHtml('docs/guide.md'), { groups: { related: { collapsed: false, start: false } } });
    expect(isCollapsed(page, 'dynamic-folder-group')).toBe(true);
    expect(page.state().groups).toEqual({});
  });
});

describe('NotebooksViewProvider keyboard', () => {
  const items = (page: Page) => Array.from(page.dom.window.document.querySelectorAll<HTMLElement>('[role="treeitem"]'));
  const label = (item: Element | null) => item?.querySelector('.folder-group-name, .folder-name, .file-name')?.textContent;
  const focused = (page: Page) => page.dom.window.document.activeElement as HTMLElement;

  function press(page: Page, key: string, target: Element = focused(page)): void {
    target.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  function focusItem(page: Page, name: string): HTMLElement {
    const item = items(page).find(candidate => label(candidate) === name);
    if (!item) {
      throw new Error(`no row "${name}" among [${items(page).map(label).join(', ')}]`);
    }
    item.focus();
    return item;
  }

  test('every row is a tree item with a level, and one of them is in the Tab order', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const tabStops = items(page).filter(item => item.tabIndex === 0);
    expect(tabStops.map(label)).toEqual(['Related Docs']);
    expect(items(page).length).toBeGreaterThan(6);
    expect(focusItem(page, 'Related Docs').getAttribute('aria-level')).toBe('1');
    expect(focusItem(page, 'Docs').getAttribute('aria-level')).toBe('2');
    expect(focusItem(page, 'Guide').getAttribute('aria-level')).toBe('3');
    expect(focusItem(page, 'Docs').getAttribute('aria-expanded')).toBe('true');
    expect(focusItem(page, 'Deploy').getAttribute('aria-expanded')).toBe('false');
  });

  test('icon-only buttons are named by their tooltip', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const unnamed = Array.from(page.dom.window.document.querySelectorAll('button[title]')).filter(button => !button.getAttribute('aria-label'));
    expect(unnamed).toEqual([]);
  });

  test('arrow keys move through the rows that can be seen', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    focusItem(page, 'Related Docs');
    press(page, 'ArrowDown');
    expect(label(focused(page))).toBe('Docs');
    press(page, 'ArrowDown');
    expect(label(focused(page))).toBe('Guide');
    press(page, 'ArrowUp');
    expect(label(focused(page))).toBe('Docs');
    expect(items(page).filter(item => item.tabIndex === 0)).toEqual([focused(page)]);

    press(page, 'End');
    expect(label(focused(page))).toBe('Guide');
    expect(focused(page).closest('.folder-group')?.id).toBe('folder-group-1');
    press(page, 'Home');
    expect(label(focused(page))).toBe('Related Docs');
  });

  test('left and right close and open folders, and move between a folder and its rows', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const docs = focusItem(page, 'Docs');
    press(page, 'ArrowRight');
    expect(label(focused(page))).toBe('Guide');
    press(page, 'ArrowLeft');
    expect(focused(page)).toBe(docs);

    press(page, 'ArrowLeft');
    expect(docs.getAttribute('aria-expanded')).toBe('false');
    expect(docs.nextElementSibling?.classList.contains('hidden')).toBe(true);
    press(page, 'ArrowDown');
    expect(label(focused(page))).not.toBe('Guide');

    focusItem(page, 'Docs');
    press(page, 'ArrowRight');
    expect(docs.getAttribute('aria-expanded')).toBe('true');
    press(page, 'ArrowLeft');
    press(page, 'ArrowLeft');
    expect(label(focused(page))).toBe('Related Docs');
  });

  test('a group closes and opens from its header, and the choice is remembered', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const header = focusItem(page, 'Related Docs');
    press(page, 'ArrowLeft');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(page.state().groups).toEqual({ related: { collapsed: true, start: false } });
    press(page, 'ArrowDown');
    expect(label(focused(page))).toBe('Workspace');
    press(page, 'ArrowUp');
    press(page, 'Enter');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  test('Enter opens a file; on a skill it opens the skill, and Space lists its files', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    focusItem(page, 'Guide');
    press(page, 'Enter');
    const skill = focusItem(page, 'Deploy');
    press(page, 'Enter');
    expect(skill.getAttribute('aria-expanded')).toBe('false');
    press(page, ' ');
    expect(skill.getAttribute('aria-expanded')).toBe('true');
    expect(page.posted).toEqual([
      { command: 'openFile', filePath: path.join(root, 'docs/guide.md') },
      { command: 'openFile', filePath: path.join(root, '.agents/skills/deploy/SKILL.md') },
    ]);
  });

  test('keys typed in a drawer or on a row\'s button are left alone', () => {
    const page = loadPage(renderHtml('docs/guide.md'));
    const input = page.dom.window.document.querySelector<HTMLInputElement>('#folder-group-1 [data-field="name"]') as HTMLInputElement;
    const event = new page.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    const rename = page.dom.window.document.querySelector('#folder-group-1 .file button[title="Rename"]') as HTMLElement;
    const onButton = new page.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    rename.dispatchEvent(onButton);
    expect(onButton.defaultPrevented).toBe(false);
    expect(page.posted).toEqual([]);
  });

  test('the open file\'s row is marked as current', () => {
    openInEditor('docs/guide.md');
    const page = loadPage(renderHtml('docs/guide.md'));
    const current = items(page).filter(item => item.getAttribute('aria-current') === 'true');
    expect(current.map(label)).toEqual(['Guide', 'Guide']);
  });
});

describe('NotebooksViewProvider messages', () => {
  const executeCommand = vscode.commands.executeCommand as jest.Mock;
  const workspaceMock = vscode.workspace as unknown as Record<string, unknown> & { getConfiguration: jest.Mock; workspaceFolders: unknown; };
  const windowMock = vscode.window as unknown as Record<string, unknown>;
  const originalGetConfiguration = workspaceMock.getConfiguration.getMockImplementation();
  const update = jest.fn(async () => undefined);
  const disposable = () => ({ dispose: jest.fn() });
  let provider: NotebooksViewProvider;
  let send: (message: unknown) => void;

  beforeEach(() => {
    // The parts of the editor that resolveWebviewView listens to
    workspaceMock.createFileSystemWatcher = jest.fn(() => ({
      onDidChange: jest.fn(), onDidCreate: jest.fn(), onDidDelete: jest.fn(), dispose: jest.fn(),
    }));
    workspaceMock.workspaceFolders = [{ name: 'repo', uri: { scheme: 'file', fsPath: root } }];
    workspaceMock.getConfiguration.mockImplementation(() => ({ get: jest.fn(), inspect: jest.fn(), update }));
    windowMock.onDidChangeActiveTextEditor = jest.fn(disposable);
    windowMock.onDidChangeActiveNotebookEditor = jest.fn(disposable);
    update.mockClear();
    executeCommand.mockClear();

    provider = new NotebooksViewProvider({ extensionPath } as unknown as vscode.ExtensionContext);
    const webview = {
      options: {},
      html: '',
      asWebviewUri: () => ({ toString: () => 'codicon.css' }),
      postMessage: jest.fn(),
      onDidReceiveMessage: (handler: (message: unknown) => void) => {
        send = handler;
        return disposable();
      },
    };
    provider.resolveWebviewView({ webview, visible: true, onDidChangeVisibility: jest.fn(disposable) } as unknown as vscode.WebviewView);
  });

  afterEach(() => {
    provider.dispose();
    workspaceMock.workspaceFolders = [];
    workspaceMock.getConfiguration.mockImplementation(originalGetConfiguration);
  });

  const savedGroups = () => JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'codebook-md.json'), 'utf8')).folderGroups;

  test('a drawer switch is written as a workspace setting', async () => {
    send({ command: 'setSetting', key: 'dynamicFolderGroup.placeRulesByScope', value: false });
    await new Promise(resolve => setImmediate(resolve));
    expect(update).toHaveBeenCalledWith('dynamicFolderGroup.placeRulesByScope', false, vscode.ConfigurationTarget.Workspace);
  });

  test('a setting the drawers do not own is not written', async () => {
    send({ command: 'setSetting', key: 'execPath', value: '/tmp' });
    await new Promise(resolve => setImmediate(resolve));
    expect(update).not.toHaveBeenCalled();
  });

  test('a hand-built group\'s options are saved to codebook-md.json', () => {
    send({ command: 'updateGroup', index: 0, patch: { name: 'Team docs', collapsed: true } });
    expect(savedGroups()[0]).toMatchObject({ name: 'Team docs', collapsed: true });
    expect(savedGroups()[0].folders[0].name).toBe(quoteFolder);
  });

  test('"All settings" opens the panel on that group', () => {
    send({ command: 'openSideBarSettings', groupId: 'group:0' });
    send({ command: 'openSideBarSettings', groupId: { evil: true } });
    expect(executeCommand).toHaveBeenNthCalledWith(1, 'codebook-md.openSideBarSettings', 'group:0');
    expect(executeCommand).toHaveBeenNthCalledWith(2, 'codebook-md.openSideBarSettings', undefined);
  });
});
