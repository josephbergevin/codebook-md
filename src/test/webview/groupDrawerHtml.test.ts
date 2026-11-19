import { JSDOM } from 'jsdom';
import * as config from '../../config';
import { FolderGroup } from '../../folders';
import { folderGroupDrawerHtml, gearButtonHtml, groupIconHtml, relatedDrawerHtml } from '../../webview/groupDrawerHtml';

const settings: config.DynamicFolderGroupConfig = {
  enabled: true,
  name: 'Related Docs',
  description: '',
  subFolderInclusions: ['.github', 'a"b<c>'],
  exclusions: [],
  includeAgentDocs: true,
  placeRulesByScope: false,
  startCollapsed: false,
  icon: '',
  position: 0,
  hiddenDocTypes: [],
};

const parse = (html: string) => new JSDOM(`<body>${html}</body>`).window.document;

describe('groupIconHtml', () => {
  test('returns a codicon for a codicon name', () => {
    expect(groupIconHtml('rocket')).toBe('<span class="codicon codicon-rocket group-icon" aria-hidden="true"></span>');
  });

  test('returns nothing for no icon or a name that is not one', () => {
    expect(groupIconHtml('')).toBe('');
    expect(groupIconHtml(undefined)).toBe('');
    expect(groupIconHtml('x" onmouseover="alert(1)')).toBe('');
  });
});

describe('gearButtonHtml', () => {
  test('names the group it belongs to, escaped', () => {
    const button = parse(gearButtonHtml('Joe\'s <docs>')).querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Settings for Joe\'s <docs>');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(button?.getAttribute('onclick')).not.toContain('Joe');
  });
});

describe('relatedDrawerHtml', () => {
  const document = parse(relatedDrawerHtml(settings));

  test('starts closed', () => {
    expect(document.querySelector<HTMLElement>('[data-drawer]')?.hidden).toBe(true);
  });

  test('has a switch for each quick option, set from the settings', () => {
    const switches = Array.from(document.querySelectorAll<HTMLInputElement>('input[role="switch"]'))
      .map(input => [input.dataset.setting, input.checked]);
    expect(switches).toEqual([
      ['dynamicFolderGroup.includeAgentDocs', true],
      ['dynamicFolderGroup.placeRulesByScope', false],
      ['dynamicFolderGroup.startCollapsed', false],
    ]);
  });

  test('lists the folders to look inside as data, never as markup or script', () => {
    const chips = document.querySelector<HTMLElement>('.chips');
    expect(chips?.dataset.setting).toBe('dynamicFolderGroup.subFolderInclusions');
    expect(JSON.parse(chips?.dataset.values ?? '')).toEqual(['.github', 'a"b<c>']);
    expect(Array.from(document.querySelectorAll('.chip-text')).map(chip => chip.textContent)).toEqual(['.github', 'a"b<c>']);
    expect(document.querySelector('c')).toBeNull();
    for (const element of Array.from(document.querySelectorAll('[onclick], [onchange], [onkeydown]'))) {
      const handlers = ['onclick', 'onchange', 'onkeydown'].map(name => element.getAttribute(name) ?? '').join(' ');
      expect(handlers).not.toContain('github');
    }
  });

  test('links to the full settings for the generated group', () => {
    expect(document.querySelector<HTMLElement>('.drawer-link')?.dataset.groupId).toBe('related');
  });
});

describe('folderGroupDrawerHtml', () => {
  const group = new FolderGroup('Joe\'s "docs"', '', 'Notes & <things>', []);
  group.collapsed = true;
  const document = parse(folderGroupDrawerHtml(group, 2));

  test('fills the name and description as values', () => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    expect(inputs.map(input => [input.dataset.field, input.value, input.dataset.groupIndex])).toEqual([
      ['name', 'Joe\'s "docs"', '2'],
      ['description', 'Notes & <things>', '2'],
    ]);
    expect(document.querySelector('things')).toBeNull();
  });

  test('shows whether the group starts collapsed', () => {
    const input = document.querySelector<HTMLInputElement>('input[data-field="collapsed"]');
    expect(input?.checked).toBe(true);
    expect(input?.dataset.groupIndex).toBe('2');
  });

  test('offers to hide the group and to open its full settings', () => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button')).map(button => [button.textContent, button.dataset.groupIndex, button.dataset.groupId]);
    expect(buttons).toEqual([['Hide group', '2', undefined], ['All settings', undefined, 'group:2']]);
  });

  test('gives each control a key that is unique within the drawer', () => {
    const keys = Array.from(document.querySelectorAll<HTMLElement>('[data-focus-key]')).map(control => control.dataset.focusKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
