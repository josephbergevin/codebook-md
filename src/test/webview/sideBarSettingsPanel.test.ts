import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import * as vscode from 'vscode';
import * as config from '../../config';
import * as sideBarSettings from '../../sideBarSettings';
import { handleSideBarSettingsMessage, renderSideBarSettingsHtml } from '../../webview/sideBarSettingsPanel';

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  getCodebookConfigFilePath: jest.fn(() => '/repo/.vscode/codebook-md.json'),
}));

jest.mock('../../sideBarSettings', () => ({
  ...jest.requireActual('../../sideBarSettings'),
  writeSetting: jest.fn(async () => true),
  resetSetting: jest.fn(async () => true),
  updateFolderGroup: jest.fn(() => true),
  applyGroupOrder: jest.fn(async () => true),
  sideBarState: jest.fn(),
}));

const mockedSettings = sideBarSettings as jest.Mocked<typeof sideBarSettings>;
const mockedConfig = config as jest.Mocked<typeof config>;
const template = fs.readFileSync(path.join(__dirname, '../../webview/templates/sideBarSettings.html'), 'utf8');

interface Posted {
  command: string;
  [key: string]: unknown;
}

interface Page {
  dom: JSDOM;
  document: Document;
  posted: Posted[];
  state: () => { selected?: string; };
  receive: (message: object) => void;
}

function settingState(field: sideBarSettings.SettingField, value: unknown, extra: Partial<sideBarSettings.SettingState> = {}): sideBarSettings.SettingState {
  return {
    ...field, value, defaultValue: value, source: 'default', isSetInScope: false, isOverridden: false, resetsTo: 'default',
    needsReload: false, ...extra,
  };
}

const relatedValues: Record<string, unknown> = {
  'dynamicFolderGroup.enabled': true,
  'dynamicFolderGroup.name': 'Related Docs',
  'dynamicFolderGroup.description': 'For the current file',
  'dynamicFolderGroup.icon': '',
  'dynamicFolderGroup.subFolderInclusions': ['.github'],
  'dynamicFolderGroup.exclusions': ['node_modules'],
  'dynamicFolderGroup.includeAgentDocs': true,
  'dynamicFolderGroup.placeRulesByScope': true,
  'dynamicFolderGroup.startCollapsed': false,
  'dynamicFolderGroup.hiddenDocTypes': ['license'],
};

const aiDocsValues: Record<string, unknown> = {
  'aiDocs.enabled': true,
  'aiDocs.includeUserDocs': true,
  'aiDocs.exclusions': ['node_modules'],
  'aiDocs.hiddenDocTypes': [],
};

function state(overrides: Partial<sideBarSettings.SideBarState> = {}): sideBarSettings.SideBarState {
  return {
    scope: 'workspace',
    hasWorkspace: true,
    configFile: '.vscode/codebook-md.json',
    groups: [
      { id: 'related', kind: 'auto', name: 'Related Docs', description: 'For the current file', icon: '', hidden: false, collapsed: false, summary: 'Follows the open file' },
      { id: 'group:0', kind: 'yours', index: 0, name: 'Workspace', description: '', icon: '', hidden: false, collapsed: false, summary: '4 folders, 9 files' },
      { id: 'group:1', kind: 'yours', index: 1, name: 'Joe\'s <b>runbooks</b>', description: 'On call', icon: 'flame', hidden: true, collapsed: true, summary: 'Empty' },
    ],
    related: sideBarSettings.relatedFields.map(field => settingState(field, relatedValues[field.key])),
    aiDocs: sideBarSettings.aiDocsFields.map(field => settingState(field, aiDocsValues[field.key])),
    needsReload: false,
    icons: ['folder', 'rocket', 'flame'],
    ...overrides,
  };
}

function loadPage(initial: sideBarSettings.SideBarState = state(), selectId = 'related'): Page {
  const posted: Posted[] = [];
  let saved: { selected?: string; } = {};
  const html = renderSideBarSettingsHtml(template, initial, selectId, 'test-nonce', 'vscode-resource:', 'codicon.css');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      (window as unknown as { acquireVsCodeApi: unknown; }).acquireVsCodeApi = () => ({
        postMessage: (message: Posted) => posted.push(message),
        getState: () => undefined,
        setState: (next: { selected?: string; }) => { saved = next; },
      });
    },
  });
  const receive = (message: object) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
  return { dom, document: dom.window.document, posted, state: () => saved, receive };
}

const rowNames = (page: Page, listId: string) => Array.from(page.document.querySelectorAll(`#${listId} .vn`)).map(name => name.textContent);
const fieldLabels = (page: Page) => Array.from(page.document.querySelectorAll('#detail .field'))
  .map(field => field.querySelector('.field-head span, .sw span')?.textContent);

function row(page: Page, id: string): HTMLElement {
  const found = Array.from(page.document.querySelectorAll<HTMLElement>('.vrow')).find(candidate => candidate.dataset.id === id);
  if (!found) {
    throw new Error(`no row ${id}`);
  }
  return found;
}

function field(page: Page, key: string): HTMLElement {
  const found = Array.from(page.document.querySelectorAll<HTMLElement>('#detail .field')).find(candidate => candidate.dataset.key === key);
  if (!found) {
    throw new Error(`no field ${key}`);
  }
  return found;
}

function click(page: Page, element: Element | null | undefined): void {
  if (!element) {
    throw new Error('expected an element to click');
  }
  element.dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true }));
}

function setText(page: Page, input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
}

function byText(root: ParentNode, selector: string, text: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(element => element.textContent === text);
}

describe('renderSideBarSettingsHtml', () => {
  const html = renderSideBarSettingsHtml(template, state(), 'related', 'abc123', 'vscode-resource:', 'codicon.css');

  test('only allows the script that carries the nonce', () => {
    expect(html).toContain("script-src &#039;nonce-abc123&#039;");
    expect(html).toContain('<script nonce="abc123">');
    expect(html).not.toContain('{{');
    // No inline handlers: the policy would block them
    expect(html).not.toMatch(/\son[a-z]+="/);
  });

  test('carries the state as data that cannot close its script element', () => {
    const tricky = state();
    tricky.groups[1].name = '</script><script>window.hacked = true</script>';
    const page = loadPage(tricky);
    expect((page.dom.window as unknown as { hacked?: boolean; }).hacked).toBeUndefined();
    expect(rowNames(page, 'groups')[1]).toBe('</script><script>window.hacked = true</script>');
  });
});

describe('the Side Bar Settings page', () => {
  test('lists the groups in order, then the AI Docs view', () => {
    const page = loadPage();
    expect(rowNames(page, 'groups')).toEqual(['Related Docs', 'Workspace', 'Joe\'s <b>runbooks</b>']);
    expect(rowNames(page, 'views')).toEqual(['AI Docs']);
    expect(page.document.querySelector('#groups b')).toBeNull();
    expect(Array.from(page.document.querySelectorAll('#groups .tag')).map(tag => tag.textContent)).toEqual(['auto', 'yours', 'yours']);
    expect(row(page, 'group:1').classList.contains('off')).toBe(true);
  });

  test('shows the generated group\'s options first', () => {
    const page = loadPage();
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('Related Docs');
    expect(fieldLabels(page)).toEqual(sideBarSettings.relatedFields.map(each => each.label));
    expect(row(page, 'related').classList.contains('selected')).toBe(true);
  });

  test('opens on the group it was asked for', () => {
    const page = loadPage(state(), 'group:0');
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('Workspace');
    expect(page.document.querySelector('#detail .where')?.textContent).toBe('4 folders, 9 files. Saved in .vscode/codebook-md.json');
  });

  test('selecting a row shows its options and is remembered', () => {
    const page = loadPage();
    click(page, row(page, 'group:1').querySelector('.select'));
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('Joe\'s <b>runbooks</b>');
    expect(fieldLabels(page)).toEqual(['Show this group', 'Name', 'Description', 'Icon', 'Start collapsed']);
    expect(page.state()).toEqual({ selected: 'group:1' });

    click(page, row(page, 'aiDocs').querySelector('.select'));
    expect(fieldLabels(page)).toEqual(sideBarSettings.aiDocsFields.map(each => each.label));
  });

  test('a switch saves its setting at once', () => {
    const page = loadPage();
    const input = field(page, 'dynamicFolderGroup.includeAgentDocs').querySelector<HTMLInputElement>('input[role="switch"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
    input.checked = false;
    input.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    expect(page.posted).toEqual([{ command: 'setSetting', key: 'dynamicFolderGroup.includeAgentDocs', value: false }]);
  });

  test('text is saved when the box is left, not on every key', () => {
    const page = loadPage();
    const input = field(page, 'dynamicFolderGroup.name').querySelector<HTMLInputElement>('input.text') as HTMLInputElement;
    input.value = 'Near';
    input.dispatchEvent(new page.dom.window.Event('input', { bubbles: true }));
    expect(page.posted).toEqual([]);
    setText(page, input, 'Nearby docs');
    expect(page.posted).toEqual([{ command: 'setSetting', key: 'dynamicFolderGroup.name', value: 'Nearby docs' }]);
  });

  test('list entries are added with Enter and removed with their button', () => {
    const page = loadPage();
    const list = field(page, 'dynamicFolderGroup.subFolderInclusions');
    const add = list.querySelector<HTMLInputElement>('input.text') as HTMLInputElement;
    add.value = ' tooling/** ';
    add.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    click(page, list.querySelector('.chip button'));
    expect(page.posted).toEqual([
      { command: 'setSetting', key: 'dynamicFolderGroup.subFolderInclusions', value: ['.github', 'tooling/**'] },
      { command: 'setSetting', key: 'dynamicFolderGroup.subFolderInclusions', value: [] },
    ]);
  });

  test('doc types are ticked when shown; unticking one adds it to the hidden list', () => {
    const page = loadPage();
    const types = field(page, 'dynamicFolderGroup.hiddenDocTypes');
    const boxes = Array.from(types.querySelectorAll<HTMLInputElement>('.check input'));
    expect(boxes.filter(box => !box.checked).map(box => box.parentElement?.textContent)).toEqual(['License']);

    const skill = byText(types, '.check', 'Skill')?.querySelector<HTMLInputElement>('input') as HTMLInputElement;
    skill.checked = false;
    skill.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    expect(page.posted).toEqual([{ command: 'setSetting', key: 'dynamicFolderGroup.hiddenDocTypes', value: ['license', 'skill'] }]);
  });

  test('an icon is chosen from the list, or cleared', () => {
    const page = loadPage();
    const icons = field(page, 'dynamicFolderGroup.icon');
    expect(byText(icons, 'button', 'Default')?.getAttribute('aria-checked')).toBe('true');
    click(page, icons.querySelector('button[title="rocket"]'));
    expect(page.posted).toEqual([{ command: 'setSetting', key: 'dynamicFolderGroup.icon', value: 'rocket' }]);
  });

  test('a hand-built group\'s options are saved to its place in the file', () => {
    const page = loadPage(state(), 'group:1');
    const detail = page.document.getElementById('detail') as HTMLElement;
    const inputs = Array.from(detail.querySelectorAll<HTMLInputElement>('input.text'));
    setText(page, inputs[0], 'Runbooks');
    setText(page, inputs[1], 'Pager notes');
    click(page, detail.querySelector('button[title="rocket"]'));
    const switches = Array.from(detail.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
    expect(switches.map(input => input.checked)).toEqual([false, true]);
    switches[0].checked = true;
    switches[0].dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    expect(page.posted).toEqual([
      { command: 'updateGroup', index: 1, patch: { name: 'Runbooks' } },
      { command: 'updateGroup', index: 1, patch: { description: 'Pager notes' } },
      { command: 'updateGroup', index: 1, patch: { icon: 'rocket' } },
      { command: 'updateGroup', index: 1, patch: { hide: false } },
    ]);
    // An icon outside the offered list is still shown as the current one
    expect(detail.querySelector('button[title="flame"]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('the eye on a row shows or hides that group or view', () => {
    const page = loadPage();
    click(page, row(page, 'related').querySelector('.icon-btn'));
    click(page, row(page, 'group:0').querySelector('.icon-btn'));
    click(page, row(page, 'group:1').querySelector('.icon-btn'));
    click(page, row(page, 'aiDocs').querySelector('.icon-btn'));
    expect(page.posted).toEqual([
      { command: 'setSetting', key: 'dynamicFolderGroup.enabled', value: false },
      { command: 'updateGroup', index: 0, patch: { hide: true } },
      { command: 'updateGroup', index: 1, patch: { hide: false } },
      { command: 'setSetting', key: 'aiDocs.enabled', value: false },
    ]);
    expect(row(page, 'group:1').querySelector('.icon-btn')?.getAttribute('aria-label')).toBe('Show Joe\'s <b>runbooks</b>');
  });

  test('says where each value comes from and offers a reset where one applies', () => {
    const custom = state();
    custom.related = custom.related.map(each => {
      if (each.key === 'dynamicFolderGroup.name') {
        return { ...each, source: 'workspace', isSetInScope: true, resetsTo: 'user' };
      }
      if (each.key === 'dynamicFolderGroup.exclusions') {
        return { ...each, source: 'user' };
      }
      return each;
    });
    const page = loadPage(custom);
    const meta = (key: string) => Array.from(field(page, key).querySelectorAll('.meta > *')).map(part => part.textContent);
    expect(meta('dynamicFolderGroup.name')).toEqual(['Workspace setting', 'Use my user setting']);
    expect(meta('dynamicFolderGroup.exclusions')).toEqual(['User setting']);
    expect(meta('dynamicFolderGroup.description')).toEqual(['Default']);

    click(page, field(page, 'dynamicFolderGroup.name').querySelector('.meta .link'));
    click(page, field(page, 'dynamicFolderGroup.name').querySelector('.field-head .icon-btn'));
    expect(page.posted).toEqual([
      { command: 'resetSetting', key: 'dynamicFolderGroup.name' },
      { command: 'openSetting', key: 'dynamicFolderGroup.name' },
    ]);
  });

  test('says when a workspace setting overrides the user value on show', () => {
    const custom = state({ scope: 'user' });
    custom.related = custom.related.map(each => each.key === 'dynamicFolderGroup.name'
      ? { ...each, source: 'workspace', isSetInScope: true, isOverridden: true }
      : each);
    const page = loadPage(custom);
    expect(field(page, 'dynamicFolderGroup.name').querySelector('.meta span')?.textContent).toBe('A workspace setting overrides this');
    expect(page.document.querySelector('.where')?.textContent).toContain('saved to your user settings');
  });

  test('switches between workspace and user settings', () => {
    const page = loadPage();
    const scope = (name: string) => page.document.querySelector<HTMLButtonElement>(`#scope [data-scope="${name}"]`) as HTMLButtonElement;
    expect(scope('workspace').getAttribute('aria-checked')).toBe('true');
    click(page, scope('user'));
    expect(page.posted).toEqual([{ command: 'setScope', scope: 'user' }]);

    page.receive({ command: 'state', state: state({ scope: 'user' }) });
    expect(scope('user').getAttribute('aria-checked')).toBe('true');
    expect(page.document.activeElement).toBe(scope('user'));
  });

  test('offers only user settings when no workspace is open', () => {
    const page = loadPage(state({ scope: 'user', hasWorkspace: false, groups: state().groups.slice(0, 1) }));
    expect(page.document.querySelector<HTMLButtonElement>('#scope [data-scope="workspace"]')?.disabled).toBe(true);
    // One group cannot be reordered
    expect(row(page, 'related').getAttribute('draggable')).toBeNull();
  });

  test('Alt+Down moves a group and keeps the selection and focus on it', () => {
    const page = loadPage(state(), 'group:0');
    const select = row(page, 'group:0').querySelector<HTMLElement>('.select') as HTMLElement;
    select.focus();
    select.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    expect(page.posted).toEqual([{ command: 'setOrder', order: ['related', 'group:1', 'group:0'] }]);
    expect(page.state()).toEqual({ selected: 'group:1' });

    const groups = state().groups;
    const moved = [groups[0], { ...groups[2], id: 'group:0', index: 0 }, { ...groups[1], id: 'group:1', index: 1 }];
    page.receive({ command: 'state', state: state({ groups: moved }), saved: true });
    expect(rowNames(page, 'groups')).toEqual(['Related Docs', 'Joe\'s <b>runbooks</b>', 'Workspace']);
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('Workspace');
    expect(row(page, 'group:1').contains(page.document.activeElement)).toBe(true);
    expect(page.document.getElementById('saved')?.textContent).toBe('Saved');
  });

  test('Alt+Up moves the generated group among the others, and stops at the ends', () => {
    const page = loadPage();
    const press = (id: string, key: string) => row(page, id)
      .dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
    press('related', 'ArrowUp');
    press('group:1', 'ArrowDown');
    expect(page.posted).toEqual([]);
    press('related', 'ArrowDown');
    expect(page.posted).toEqual([{ command: 'setOrder', order: ['group:0', 'related', 'group:1'] }]);
  });

  test('dropping a group on the lower half of another puts it after that one', () => {
    const page = loadPage();
    const fire = (target: Element, type: string, clientY = 0) => {
      const event = new page.dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clientY', { value: clientY });
      target.dispatchEvent(event);
    };
    fire(row(page, 'related'), 'dragstart');
    fire(row(page, 'group:0'), 'dragover', 10);
    expect(row(page, 'group:0').classList.contains('drop-after')).toBe(true);
    fire(row(page, 'group:0'), 'drop', 10);
    fire(row(page, 'related'), 'dragend');
    expect(page.posted).toEqual([{ command: 'setOrder', order: ['group:0', 'related', 'group:1'] }]);
    expect(page.document.querySelectorAll('.drop-after, .dragging')).toHaveLength(0);
  });

  test('a newer state redraws the page and keeps the focus where it was', () => {
    const page = loadPage();
    const input = () => field(page, 'dynamicFolderGroup.placeRulesByScope').querySelector<HTMLInputElement>('input') as HTMLInputElement;
    input().focus();
    const next = state();
    next.related = next.related.map(each => each.key === 'dynamicFolderGroup.placeRulesByScope' ? { ...each, value: false, source: 'workspace' } : each);
    page.receive({ command: 'state', state: next });
    expect(input().checked).toBe(false);
    expect(page.document.activeElement).toBe(input());
  });

  test('a newer state waits while a text box holds typing that is not saved yet', () => {
    const page = loadPage();
    const input = field(page, 'dynamicFolderGroup.name').querySelector<HTMLInputElement>('input.text') as HTMLInputElement;
    input.focus();
    input.value = 'Half typed';
    const next = state();
    next.groups[1].name = 'Renamed elsewhere';
    page.receive({ command: 'state', state: next });
    expect(input.isConnected).toBe(true);
    expect(rowNames(page, 'groups')[1]).toBe('Workspace');
  });

  test('the extension can ask for another group to be shown', () => {
    const page = loadPage();
    page.receive({ command: 'select', id: 'aiDocs' });
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('AI Docs');
  });

  test('falls back to the generated group when the selected one is gone', () => {
    const page = loadPage(state(), 'group:1');
    page.receive({ command: 'state', state: state({ groups: state().groups.slice(0, 2) }) });
    expect(page.document.querySelector('#detail h3')?.textContent).toBe('Related Docs');
  });
});

// The window still has the previous version's settings; see sideBarSettings
describe('the Side Bar Settings page in a window that needs a reload', () => {
  const behind = () => state({
    needsReload: true,
    aiDocs: sideBarSettings.aiDocsFields.map(each => settingState(each, aiDocsValues[each.key], { needsReload: true })),
  });

  test('says nothing about reloading when every setting is known', () => {
    const page = loadPage();
    expect(page.document.getElementById('reload-notice')?.hidden).toBe(true);
    expect(page.document.querySelectorAll('.field.needs-reload')).toHaveLength(0);
  });

  test('shows a notice whose button asks for a reload', () => {
    const page = loadPage(behind());
    const notice = page.document.getElementById('reload-notice');
    expect(notice?.hidden).toBe(false);
    expect(notice?.textContent).toContain('Reload the window to finish');
    click(page, page.document.getElementById('reload-window'));
    expect(page.posted).toEqual([{ command: 'reloadWindow' }]);
  });

  test('shows the options that are waiting with their real values, but they cannot be changed', () => {
    const page = loadPage(behind(), 'aiDocs');
    const waiting = field(page, 'aiDocs.includeUserDocs');
    const toggle = waiting.querySelector<HTMLInputElement>('input[role="switch"]');
    expect(toggle?.checked).toBe(true);
    expect(toggle?.disabled).toBe(true);
    expect(Array.from(waiting.querySelectorAll<HTMLButtonElement>('button')).every(button => button.disabled)).toBe(true);
    expect(waiting.querySelector('.meta')?.textContent).toBe('Reload the window to change this');
    expect(Array.from(page.document.querySelectorAll('#detail .field.needs-reload'))).toHaveLength(sideBarSettings.aiDocsFields.length);
  });

  test('leaves the options the window knows as they were', () => {
    const page = loadPage(behind());
    const known = field(page, 'dynamicFolderGroup.includeAgentDocs');
    expect(known.classList.contains('needs-reload')).toBe(false);
    expect(known.querySelector<HTMLInputElement>('input[role="switch"]')?.disabled).toBe(false);
    expect(known.querySelector('.meta')?.textContent).toBe('Default');
  });

  test('the notice goes away when a newer state says every setting is known', () => {
    const page = loadPage(behind());
    page.receive({ command: 'state', state: state() });
    expect(page.document.getElementById('reload-notice')?.hidden).toBe(true);
  });
});

describe('handleSideBarSettingsMessage', () => {
  const executeCommand = vscode.commands.executeCommand as jest.Mock;
  const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
  const settled = () => new Promise(resolve => setImmediate(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
    // The shared vscode mock is built outside this test's registry, so its
    // functions are cleared one by one
    executeCommand.mockClear();
    (vscode.window.showErrorMessage as jest.Mock).mockClear();
    showWarningMessage.mockReset();
    mockedConfig.getCodebookConfigFilePath.mockReturnValue('/repo/.vscode/codebook-md.json');
  });

  test('offers a reload when a setting is waiting for one, and reloads when asked', async () => {
    showWarningMessage.mockResolvedValueOnce('Reload Window');
    mockedSettings.writeSetting.mockRejectedValueOnce(new sideBarSettings.ReloadNeededError());
    await handleSideBarSettingsMessage({ command: 'setSetting', key: 'aiDocs.includeUserDocs', value: false });
    await settled();
    expect(showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Reload the window to finish'), 'Reload Window');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  test('does not reload when the offer is dismissed', async () => {
    showWarningMessage.mockResolvedValueOnce(undefined);
    mockedSettings.applyGroupOrder.mockRejectedValueOnce(new sideBarSettings.ReloadNeededError());
    await handleSideBarSettingsMessage({ command: 'setOrder', order: ['group:0', 'related'] });
    await settled();
    expect(showWarningMessage).toHaveBeenCalledTimes(1);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('the notice\'s button reloads the window', async () => {
    await handleSideBarSettingsMessage({ command: 'reloadWindow' });
    expect(executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  test('writes and resets settings at the scope that is selected', async () => {
    await handleSideBarSettingsMessage({ command: 'setScope', scope: 'user' });
    await handleSideBarSettingsMessage({ command: 'setSetting', key: 'aiDocs.enabled', value: false });
    await handleSideBarSettingsMessage({ command: 'resetSetting', key: 'aiDocs.enabled' });
    expect(mockedSettings.writeSetting).toHaveBeenCalledWith('aiDocs.enabled', false, 'user');
    expect(mockedSettings.resetSetting).toHaveBeenCalledWith('aiDocs.enabled', 'user');

    await handleSideBarSettingsMessage({ command: 'setScope', scope: 'everyone' });
    await handleSideBarSettingsMessage({ command: 'setScope', scope: 'workspace' });
    await handleSideBarSettingsMessage({ command: 'setSetting', key: 'aiDocs.enabled', value: true });
    expect(mockedSettings.writeSetting).toHaveBeenLastCalledWith('aiDocs.enabled', true, 'workspace');
  });

  test('passes group changes and a new order to the config file', async () => {
    await handleSideBarSettingsMessage({ command: 'updateGroup', index: 1, patch: { hide: true } });
    await handleSideBarSettingsMessage({ command: 'setOrder', order: ['group:0', 'related'] });
    expect(mockedSettings.updateFolderGroup).toHaveBeenCalledWith('/repo/.vscode/codebook-md.json', 1, { hide: true });
    expect(mockedSettings.applyGroupOrder).toHaveBeenCalledWith('/repo/.vscode/codebook-md.json', ['group:0', 'related'], 'workspace');
  });

  test('opens one setting in the Settings UI', async () => {
    await handleSideBarSettingsMessage({ command: 'openSetting', key: 'dynamicFolderGroup.exclusions' });
    await handleSideBarSettingsMessage({ command: 'openSetting', key: 'x y; rm' });
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'codebook-md.dynamicFolderGroup.exclusions');
  });

  test('ignores a message it does not know', async () => {
    await handleSideBarSettingsMessage({ command: 'deleteEverything' });
    await handleSideBarSettingsMessage({} as Record<string, unknown>);
    expect(mockedSettings.writeSetting).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test('tells the user when a change cannot be saved', async () => {
    mockedSettings.writeSetting.mockRejectedValueOnce(new Error('settings are read-only'));
    await handleSideBarSettingsMessage({ command: 'setSetting', key: 'aiDocs.enabled', value: false });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Codebook: could not save the setting - settings are read-only');
  });
});

describe('openSideBarSettingsPanel', () => {
  const os = jest.requireActual('os') as typeof import('os');
  const windowMock = vscode.window as unknown as Record<string, unknown>;
  const workspaceMock = vscode.workspace as unknown as Record<string, unknown>;
  const disposable = () => ({ dispose: jest.fn() });
  let extensionPath: string;
  let dispose: (() => void) | undefined;
  let configListener: ((event: { affectsConfiguration: (section: string) => boolean; }) => void) | undefined;

  function panelStub() {
    const webview = {
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: () => ({ toString: () => 'codicon.css' }),
      postMessage: jest.fn(),
      onDidReceiveMessage: jest.fn(disposable),
    };
    return {
      webview,
      reveal: jest.fn(),
      dispose: jest.fn(),
      onDidDispose: jest.fn((handler: () => void) => {
        dispose = handler;
        return disposable();
      }),
    };
  }

  beforeEach(() => {
    extensionPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-ext-')));
    const templates = path.join(extensionPath, 'dist', 'templates');
    fs.mkdirSync(templates, { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../../webview/templates/sideBarSettings.html'), path.join(templates, 'sideBarSettings.html'));

    mockedSettings.sideBarState.mockReturnValue(state());
    workspaceMock.createFileSystemWatcher = jest.fn(() => ({
      onDidChange: jest.fn(), onDidCreate: jest.fn(), onDidDelete: jest.fn(), dispose: jest.fn(),
    }));
    workspaceMock.onDidChangeWorkspaceFolders = jest.fn(disposable);
    (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation((listener: typeof configListener) => {
      configListener = listener;
      return disposable();
    });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    fs.rmSync(extensionPath, { recursive: true, force: true });
  });

  test('opens one panel, and brings it forward on the group asked for the next time', () => {
    // Loaded here so the module's "is a panel open" state starts fresh
    const { openSideBarSettingsPanel, isSideBarSettingsOpen } = jest.requireActual('../../webview/sideBarSettingsPanel') as typeof import('../../webview/sideBarSettingsPanel');
    const panel = panelStub();
    const createWebviewPanel = jest.fn(() => panel);
    windowMock.createWebviewPanel = createWebviewPanel;
    const context = { extensionPath, subscriptions: [] as unknown[] } as unknown as vscode.ExtensionContext;

    openSideBarSettingsPanel(context, { selectId: 'group:0' });
    expect(isSideBarSettingsOpen()).toBe(true);
    expect(panel.webview.html).toContain('<title>Side Bar Settings</title>');
    expect(panel.webview.html).toContain('"selectId":"group:0"');
    expect(context.subscriptions).toEqual([panel]);

    openSideBarSettingsPanel(context, { selectId: 'aiDocs' });
    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledTimes(1);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ command: 'select', id: 'aiDocs' });

    // A setting changed elsewhere reaches the open page
    panel.webview.postMessage.mockClear();
    configListener?.({ affectsConfiguration: section => section === 'codebook-md.aiDocs' });
    configListener?.({ affectsConfiguration: () => false });
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ command: 'state', state: state(), saved: false });

    dispose?.();
    dispose = undefined;
    expect(isSideBarSettingsOpen()).toBe(false);
  });
});
