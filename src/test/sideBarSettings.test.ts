import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../config';
import { CodebookConfig } from '../folders';
import {
  aiDocsFields, applyGroupOrder, defaultScope, groupIconChoices, groupStates, isIconName, normalizeSettingValue,
  readSetting, relatedFields, relatedPosition, resetSetting, SettingField, sideBarState, updateFolderGroup, writeSetting,
} from '../sideBarSettings';

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  getDynamicFolderGroupConfig: jest.fn(),
  getCodebookConfigFilePath: jest.fn(),
}));

const mockedConfig = config as jest.Mocked<typeof config>;
const workspaceMock = vscode.workspace as unknown as {
  getConfiguration: jest.Mock;
  workspaceFolders: unknown[];
};
const originalGetConfiguration = workspaceMock.getConfiguration.getMockImplementation();

interface Inspected {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}

let root: string;
let configPath: string;
let stored: Record<string, Inspected>;
const update = jest.fn(async () => undefined);

const field = (key: string): SettingField => {
  const found = [...relatedFields, ...aiDocsFields].find(candidate => candidate.key === key);
  if (!found) {
    throw new Error(`no field ${key}`);
  }
  return found;
};

function dynamicSettings(overrides: Partial<config.DynamicFolderGroupConfig> = {}): config.DynamicFolderGroupConfig {
  return {
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
  };
}

function writeGroups(groups: object[]): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ folderGroups: groups }, null, 2), 'utf8');
}

function readGroups(): { name: string; description?: string; icon?: string; hide?: boolean; collapsed?: boolean; folders: unknown[]; }[] {
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).folderGroups;
}

const group = (name: string, extra: object = {}) => ({ name, description: '', icon: '', hide: false, folders: [], ...extra });

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-settings-')));
  configPath = path.join(root, '.vscode', 'codebook-md.json');
  stored = {};
  update.mockClear();
  workspaceMock.workspaceFolders = [{ name: 'repo', uri: { scheme: 'file', fsPath: root } }];
  workspaceMock.getConfiguration.mockImplementation(() => ({
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
    inspect: jest.fn((key: string) => stored[key]),
    update,
  }));
  mockedConfig.getCodebookConfigFilePath.mockReturnValue(configPath);
  mockedConfig.getDynamicFolderGroupConfig.mockReturnValue(dynamicSettings());
});

afterEach(() => {
  workspaceMock.workspaceFolders = [];
  workspaceMock.getConfiguration.mockImplementation(originalGetConfiguration);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the fields', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const declared = packageJson.contributes.configuration.properties as Record<string, { type: string; items?: { enum?: string[]; }; }>;

  test('each name a setting that package.json declares, with a matching type', () => {
    const types: Record<string, string> = { boolean: 'boolean', text: 'string', icon: 'string', list: 'array', 'hidden-choices': 'array' };
    for (const candidate of [...relatedFields, ...aiDocsFields]) {
      const schema = declared[`codebook-md.${candidate.key}`];
      expect(schema).toBeDefined();
      expect(schema.type).toBe(types[candidate.kind]);
    }
  });

  test('offer the same choices that package.json allows', () => {
    for (const candidate of [...relatedFields, ...aiDocsFields].filter(each => each.kind === 'hidden-choices')) {
      const allowed = declared[`codebook-md.${candidate.key}`].items?.enum;
      expect(candidate.choices?.map(choice => choice.id)).toEqual(allowed);
    }
  });

  test('offer only icons that are in the codicon font', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'), 'utf8');
    const missing = groupIconChoices.filter(name => !css.includes(`.codicon-${name}:before`));
    expect(missing).toEqual([]);
  });
});

describe('isIconName', () => {
  test('accepts codicon names', () => {
    expect(isIconName('folder-library')).toBe(true);
    expect(isIconName('star-full')).toBe(true);
  });

  test('rejects anything that could leave a class attribute', () => {
    expect(isIconName('')).toBe(false);
    expect(isIconName('x" onload="alert(1)')).toBe(false);
    expect(isIconName('Folder')).toBe(false);
    expect(isIconName('a b')).toBe(false);
    expect(isIconName(7)).toBe(false);
  });
});

describe('normalizeSettingValue', () => {
  test('keeps a boolean for a switch and refuses anything else', () => {
    expect(normalizeSettingValue(field('dynamicFolderGroup.enabled'), false)).toBe(false);
    expect(normalizeSettingValue(field('dynamicFolderGroup.enabled'), 'false')).toBeUndefined();
  });

  test('trims text', () => {
    expect(normalizeSettingValue(field('dynamicFolderGroup.name'), '  Docs  ')).toBe('Docs');
    expect(normalizeSettingValue(field('dynamicFolderGroup.name'), 3)).toBeUndefined();
  });

  test('cleans a list: trimmed, no blanks, no repeats, strings only', () => {
    const value = normalizeSettingValue(field('dynamicFolderGroup.subFolderInclusions'), [' .github ', '', '.github', 4, 'tooling/**']);
    expect(value).toEqual(['.github', 'tooling/**']);
    expect(normalizeSettingValue(field('dynamicFolderGroup.subFolderInclusions'), '.github')).toBeUndefined();
  });

  test('keeps only known choices, in the order they are listed', () => {
    const value = normalizeSettingValue(field('dynamicFolderGroup.hiddenDocTypes'), ['skill', 'nonsense', 'readme']);
    expect(value).toEqual(['readme', 'skill']);
  });

  test('takes an icon name or an empty string', () => {
    expect(normalizeSettingValue(field('dynamicFolderGroup.icon'), 'rocket')).toBe('rocket');
    expect(normalizeSettingValue(field('dynamicFolderGroup.icon'), '')).toBe('');
    expect(normalizeSettingValue(field('dynamicFolderGroup.icon'), '<b>')).toBeUndefined();
  });
});

describe('readSetting', () => {
  const name = field('dynamicFolderGroup.name');

  test('shows the default when nothing is set', () => {
    stored[name.key] = { defaultValue: 'Current Context' };
    expect(readSetting(name, 'workspace')).toMatchObject({
      value: 'Current Context', source: 'default', isSetInScope: false, isOverridden: false, resetsTo: 'default',
    });
  });

  test('shows the user value from the workspace when the workspace sets none', () => {
    stored[name.key] = { defaultValue: 'Current Context', globalValue: 'Mine' };
    expect(readSetting(name, 'workspace')).toMatchObject({ value: 'Mine', source: 'user', isSetInScope: false });
    expect(readSetting(name, 'user')).toMatchObject({ value: 'Mine', source: 'user', isSetInScope: true, resetsTo: 'default' });
  });

  test('a workspace value wins, and resetting it goes back to the user value', () => {
    stored[name.key] = { defaultValue: 'Current Context', globalValue: 'Mine', workspaceValue: 'Related Docs' };
    expect(readSetting(name, 'workspace')).toMatchObject({
      value: 'Related Docs', source: 'workspace', isSetInScope: true, resetsTo: 'user',
    });
  });

  test('the user view shows the user value and says the workspace overrides it', () => {
    stored[name.key] = { defaultValue: 'Current Context', globalValue: 'Mine', workspaceValue: 'Related Docs' };
    expect(readSetting(name, 'user')).toMatchObject({ value: 'Mine', source: 'workspace', isOverridden: true });
  });

  test('a false workspace value is still a value', () => {
    const enabled = field('dynamicFolderGroup.enabled');
    stored[enabled.key] = { defaultValue: true, workspaceValue: false };
    expect(readSetting(enabled, 'workspace')).toMatchObject({ value: false, source: 'workspace', isSetInScope: true });
  });
});

describe('writeSetting and resetSetting', () => {
  test('write to the workspace or to user settings', async () => {
    expect(await writeSetting('dynamicFolderGroup.includeAgentDocs', false, 'workspace')).toBe(true);
    expect(update).toHaveBeenLastCalledWith('dynamicFolderGroup.includeAgentDocs', false, vscode.ConfigurationTarget.Workspace);
    expect(await writeSetting('aiDocs.includeUserDocs', false, 'user')).toBe(true);
    expect(update).toHaveBeenLastCalledWith('aiDocs.includeUserDocs', false, vscode.ConfigurationTarget.Global);
  });

  test('write to user settings when no workspace is open', async () => {
    workspaceMock.workspaceFolders = [];
    expect(defaultScope()).toBe('user');
    await writeSetting('dynamicFolderGroup.includeAgentDocs', false, 'workspace');
    expect(update).toHaveBeenLastCalledWith('dynamicFolderGroup.includeAgentDocs', false, vscode.ConfigurationTarget.Global);
  });

  test('refuse a key the UI does not own', async () => {
    expect(await writeSetting('execPath', '/tmp', 'workspace')).toBe(false);
    expect(await writeSetting('dynamicFolderGroup.position', 3, 'workspace')).toBe(false);
    expect(await writeSetting(undefined, true, 'workspace')).toBe(false);
    expect(await resetSetting('rootPath', 'workspace')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  test('refuse a value of the wrong kind', async () => {
    expect(await writeSetting('dynamicFolderGroup.enabled', 'yes', 'workspace')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  test('an emptied name goes back to the level below instead of being saved blank', async () => {
    await writeSetting('dynamicFolderGroup.name', '   ', 'workspace');
    expect(update).toHaveBeenLastCalledWith('dynamicFolderGroup.name', undefined, vscode.ConfigurationTarget.Workspace);
    await writeSetting('dynamicFolderGroup.description', '', 'workspace');
    expect(update).toHaveBeenLastCalledWith('dynamicFolderGroup.description', '', vscode.ConfigurationTarget.Workspace);
  });

  test('reset removes the value at the chosen scope', async () => {
    expect(await resetSetting('dynamicFolderGroup.exclusions', 'user')).toBe(true);
    expect(update).toHaveBeenLastCalledWith('dynamicFolderGroup.exclusions', undefined, vscode.ConfigurationTarget.Global);
  });
});

describe('groupStates', () => {
  const codebookConfig = (groups: object[]) => ({ folderGroups: groups }) as unknown as CodebookConfig;

  test('puts the generated group first by default', () => {
    const states = groupStates(codebookConfig([group('Workspace'), group('Runbooks')]), dynamicSettings());
    expect(states.map(state => state.id)).toEqual(['related', 'group:0', 'group:1']);
    expect(states[0]).toMatchObject({ kind: 'auto', name: 'Related Docs', hidden: false });
  });

  test('puts the generated group at its position among the others', () => {
    const groups = codebookConfig([group('Workspace'), group('Runbooks')]);
    expect(groupStates(groups, dynamicSettings({ position: 1 })).map(state => state.id)).toEqual(['group:0', 'related', 'group:1']);
    expect(groupStates(groups, dynamicSettings({ position: 9 })).map(state => state.id)).toEqual(['group:0', 'group:1', 'related']);
  });

  test('describes a hand-built group', () => {
    const folders = [{ name: 'A', files: [{ name: 'x', path: 'x.md' }], folders: [{ name: 'B', files: [{ name: 'y', path: 'y.md' }], folders: [] }] }];
    const states = groupStates(codebookConfig([group('Runbooks', { icon: 'rocket', hide: true, collapsed: true, folders })]), dynamicSettings());
    expect(states[1]).toEqual({
      id: 'group:0', kind: 'yours', index: 0, name: 'Runbooks', description: '', icon: 'rocket',
      hidden: true, collapsed: true, summary: '1 folder, 2 files',
    });
  });

  test('drops an icon that is not a codicon name', () => {
    const states = groupStates(codebookConfig([group('Runbooks', { icon: '"><script>' })]), dynamicSettings({ icon: 'not valid' }));
    expect(states.map(state => state.icon)).toEqual(['', '']);
  });

  test('shows the generated group as hidden when it is turned off', () => {
    expect(groupStates(codebookConfig([]), dynamicSettings({ enabled: false }))[0].hidden).toBe(true);
  });
});

describe('relatedPosition', () => {
  test('stays within the groups there are', () => {
    expect(relatedPosition(-2, 3)).toBe(0);
    expect(relatedPosition(2.7, 3)).toBe(2);
    expect(relatedPosition(10, 3)).toBe(3);
    expect(relatedPosition(Number.NaN, 3)).toBe(0);
  });
});

describe('sideBarState', () => {
  test('gathers the groups and both sets of fields', () => {
    writeGroups([group('Workspace')]);
    const state = sideBarState('workspace');
    expect(state).toMatchObject({ scope: 'workspace', hasWorkspace: true, configFile: '.vscode/codebook-md.json' });
    expect(state.groups.map(each => each.id)).toEqual(['related', 'group:0']);
    expect(state.related.map(each => each.key)).toEqual(relatedFields.map(each => each.key));
    expect(state.aiDocs.map(each => each.key)).toEqual(aiDocsFields.map(each => each.key));
  });

  test('falls back to user settings when no workspace is open', () => {
    workspaceMock.workspaceFolders = [];
    expect(sideBarState('workspace')).toMatchObject({ scope: 'user', hasWorkspace: false });
  });
});

describe('updateFolderGroup', () => {
  beforeEach(() => {
    writeGroups([
      group('Workspace', { folders: [{ name: 'Docs', files: [{ name: 'Guide', path: 'docs/guide.md' }], folders: [] }] }),
      group('Runbooks'),
    ]);
  });

  test('changes the named options and leaves the rest alone', () => {
    expect(updateFolderGroup(configPath, 1, { name: ' On call ', description: 'Pager notes', icon: 'flame', collapsed: true })).toBe(true);
    const groups = readGroups();
    expect(groups[1]).toMatchObject({ name: 'On call', description: 'Pager notes', icon: 'flame', collapsed: true, hide: false });
    expect(groups[0]).toMatchObject({ name: 'Workspace', folders: [{ name: 'Docs', files: [{ name: 'Guide', path: 'docs/guide.md' }] }] });
  });

  test('hides and shows a group', () => {
    expect(updateFolderGroup(configPath, 0, { hide: true })).toBe(true);
    expect(readGroups()[0].hide).toBe(true);
    expect(updateFolderGroup(configPath, 0, { hide: false })).toBe(true);
    expect(readGroups()[0].hide).toBe(false);
  });

  test('ignores an empty name, a bad icon and values of the wrong kind', () => {
    const before = fs.readFileSync(configPath, 'utf8');
    expect(updateFolderGroup(configPath, 0, { name: '   ' })).toBe(false);
    expect(updateFolderGroup(configPath, 0, { icon: 'x" y' })).toBe(false);
    expect(updateFolderGroup(configPath, 0, { hide: 'true', collapsed: 1 })).toBe(false);
    expect(updateFolderGroup(configPath, 0, { folders: [] })).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
  });

  test('does nothing for a group that is not there', () => {
    expect(updateFolderGroup(configPath, 5, { name: 'X' })).toBe(false);
    expect(updateFolderGroup(configPath, '0', { name: 'X' })).toBe(false);
    expect(updateFolderGroup(path.join(root, 'missing.json'), 0, { name: 'X' })).toBe(false);
    expect(updateFolderGroup('', 0, { name: 'X' })).toBe(false);
  });

  test('does not write when nothing changed', () => {
    const before = fs.statSync(configPath).mtimeMs;
    expect(updateFolderGroup(configPath, 0, { name: 'Workspace', hide: false })).toBe(false);
    expect(fs.statSync(configPath).mtimeMs).toBe(before);
  });
});

describe('applyGroupOrder', () => {
  beforeEach(() => {
    writeGroups([group('A'), group('B'), group('C')]);
  });

  test('rewrites the hand-built groups in the new order', async () => {
    expect(await applyGroupOrder(configPath, ['related', 'group:2', 'group:0', 'group:1'], 'workspace')).toBe(true);
    expect(readGroups().map(each => each.name)).toEqual(['C', 'A', 'B']);
    expect(update).not.toHaveBeenCalled();
  });

  test('saves where the generated group sits, without touching the file', async () => {
    const before = fs.readFileSync(configPath, 'utf8');
    expect(await applyGroupOrder(configPath, ['group:0', 'group:1', 'related', 'group:2'], 'workspace')).toBe(true);
    expect(update).toHaveBeenCalledWith('dynamicFolderGroup.position', 2, vscode.ConfigurationTarget.Workspace);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
  });

  test('removes the position when the level below already gives it', async () => {
    mockedConfig.getDynamicFolderGroupConfig.mockReturnValue(dynamicSettings({ position: 2 }));
    stored['dynamicFolderGroup.position'] = { defaultValue: 0, workspaceValue: 2 };
    await applyGroupOrder(configPath, ['related', 'group:0', 'group:1', 'group:2'], 'workspace');
    expect(update).toHaveBeenCalledWith('dynamicFolderGroup.position', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('keeps an explicit first place when user settings say otherwise', async () => {
    mockedConfig.getDynamicFolderGroupConfig.mockReturnValue(dynamicSettings({ position: 2 }));
    stored['dynamicFolderGroup.position'] = { defaultValue: 0, globalValue: 2 };
    await applyGroupOrder(configPath, ['related', 'group:0', 'group:1', 'group:2'], 'workspace');
    expect(update).toHaveBeenCalledWith('dynamicFolderGroup.position', 0, vscode.ConfigurationTarget.Workspace);
  });

  test('refuses an order that is not a rearrangement of the groups', async () => {
    const before = fs.readFileSync(configPath, 'utf8');
    expect(await applyGroupOrder(configPath, ['related', 'group:0', 'group:1'], 'workspace')).toBe(false);
    expect(await applyGroupOrder(configPath, ['related', 'group:0', 'group:0', 'group:1'], 'workspace')).toBe(false);
    expect(await applyGroupOrder(configPath, ['related', 'group:0', 'group:1', 'group:7'], 'workspace')).toBe(false);
    expect(await applyGroupOrder(configPath, 'related', 'workspace')).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
    expect(update).not.toHaveBeenCalled();
  });

  test('moves the generated group when there is no codebook-md.json', async () => {
    fs.rmSync(configPath);
    expect(await applyGroupOrder(configPath, ['related'], 'workspace')).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});
