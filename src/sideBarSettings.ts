import { ConfigurationTarget, extensions, workspace } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { aiDocGroups } from './aiDocs';
import * as config from './config';
import { docTypes } from './docTypes';
import { CodebookConfig, FolderGroup, FolderGroupFolder, readCodebookConfig, writeCodebookConfig } from './folders';

/**
 * What the side bar's own settings UI reads and writes: the settings panel
 * and the drawer under each group in My Notebooks.
 *
 * Two stores are involved. How the generated groups behave lives in VS Code
 * settings (`codebook-md.dynamicFolderGroup.*`, `codebook-md.aiDocs.*`), which
 * have a workspace value, a user value and a default. The folder groups built
 * by hand - their names, order and options - live in
 * `.vscode/codebook-md.json`.
 *
 * Nothing here builds HTML. Every value that arrives from a page is checked
 * against the list of fields below before it is written anywhere.
 */

/** Which level of VS Code settings a change is written to. */
export type SettingScope = 'workspace' | 'user';

/** Where the value in effect comes from. */
export type SettingSource = 'workspace' | 'user' | 'default';

export type SettingKind = 'boolean' | 'text' | 'list' | 'hidden-choices' | 'icon';

export interface SettingChoice {
  id: string;
  label: string;
}

/** One VS Code setting the UI can change. */
export interface SettingField {
  // The key below `codebook-md.`, e.g. `dynamicFolderGroup.enabled`
  key: string;
  kind: SettingKind;
  label: string;
  help?: string;
  // For 'hidden-choices': everything that can be shown; the setting stores the ones turned off
  choices?: SettingChoice[];
  // For 'list' and 'text'
  placeholder?: string;
}

/** A field with the values it has now. */
export interface SettingState extends SettingField {
  // The value as seen from the chosen scope: the workspace view is the value
  // in effect, the user view ignores what the workspace sets
  value: unknown;
  defaultValue: unknown;
  // Where the value in effect comes from
  source: SettingSource;
  // The chosen scope has a value of its own, which Reset removes
  isSetInScope: boolean;
  // What applies once that value is removed
  resetsTo: 'user' | 'default';
  // Looking at user settings while the workspace sets something else
  isOverridden: boolean;
  // The window does not know this setting yet: the extension was updated and
  // only the extension host restarted. It cannot be written until a reload.
  needsReload: boolean;
}

/** The id of the generated group in every list of groups. */
export const relatedGroupId = 'related';

/** One group in the My Notebooks view. */
export interface GroupState {
  // `related` for the generated group, `group:<index>` for one built by hand
  id: string;
  kind: 'auto' | 'yours';
  // Position in codebook-md.json's folderGroups, for groups built by hand
  index?: number;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
  collapsed: boolean;
  // What is in it, e.g. "4 folders, 9 files"
  summary: string;
}

/** Everything the settings panel shows. */
export interface SideBarState {
  scope: SettingScope;
  // Without a workspace there are no workspace settings and no folder groups
  hasWorkspace: boolean;
  // Where folder groups are saved, for display
  configFile: string;
  // The groups in My Notebooks, in the order they are shown
  groups: GroupState[];
  related: SettingState[];
  aiDocs: SettingState[];
  // Some settings cannot be changed until the window is reloaded
  needsReload: boolean;
  // Icons offered for a group
  icons: string[];
}

/** The options of a hand-built group that the UI can change. */
export interface GroupPatch {
  name?: string;
  description?: string;
  icon?: string;
  hide?: boolean;
  collapsed?: boolean;
}

/** Icons offered for a group, as codicon names. */
export const groupIconChoices: string[] = [
  'folder', 'folder-library', 'book', 'notebook', 'library', 'bookmark', 'target', 'compass',
  'robot', 'mortar-board', 'lightbulb', 'rocket', 'star-full', 'heart', 'home', 'pinned',
  'beaker', 'tools', 'gear', 'terminal', 'code', 'bug', 'checklist', 'tag',
  'database', 'server', 'cloud', 'globe', 'package', 'archive', 'organization', 'shield',
  'law', 'history', 'graph', 'pulse', 'flame', 'zap', 'telescope', 'key',
];

const iconNamePattern = /^[a-z][a-z0-9-]*$/;
const maxTextLength = 200;
const maxListEntries = 100;

/** isIconName reports whether text is safe to use as a codicon class name. */
export function isIconName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && iconNamePattern.test(value);
}

/** The Related Docs group's settings, in the order the panel lists them. */
export const relatedFields: SettingField[] = [
  { key: 'dynamicFolderGroup.enabled', kind: 'boolean', label: 'Show this group' },
  { key: 'dynamicFolderGroup.name', kind: 'text', label: 'Name' },
  { key: 'dynamicFolderGroup.description', kind: 'text', label: 'Description' },
  { key: 'dynamicFolderGroup.icon', kind: 'icon', label: 'Icon' },
  {
    key: 'dynamicFolderGroup.subFolderInclusions', kind: 'list', label: 'Look inside',
    help: 'Folders to open at each level, besides agent docs. A plain name matches at every level; tooling/** is a pattern.',
    placeholder: 'Add a folder',
  },
  {
    key: 'dynamicFolderGroup.exclusions', kind: 'list', label: 'Skip',
    help: 'File and folder names to leave out.', placeholder: 'Add a name',
  },
  {
    key: 'dynamicFolderGroup.includeAgentDocs', kind: 'boolean', label: 'Find agent docs automatically',
    help: 'Skills, instruction files, rules, prompts and agent definitions.',
  },
  {
    key: 'dynamicFolderGroup.placeRulesByScope', kind: 'boolean', label: 'Place scoped rules at the folder they apply to',
    help: 'Read from applyTo, paths, globs or fileMatchPattern.',
  },
  { key: 'dynamicFolderGroup.startCollapsed', kind: 'boolean', label: 'Start collapsed' },
  {
    key: 'dynamicFolderGroup.hiddenDocTypes', kind: 'hidden-choices', label: 'Doc types shown',
    choices: docTypes.map(info => ({ id: info.id, label: info.label })),
  },
];

/** The AI Docs view's settings, in the order the panel lists them. */
export const aiDocsFields: SettingField[] = [
  {
    key: 'aiDocs.enabled', kind: 'boolean', label: 'Show the AI Docs view',
    help: 'The view appears when the workspace has agent docs.',
  },
  {
    key: 'aiDocs.includeUserDocs', kind: 'boolean', label: 'Include your own agent docs',
    help: 'The ones kept in your home folder, such as ~/.claude/skills.',
  },
  {
    key: 'aiDocs.exclusions', kind: 'list', label: 'Skip',
    help: 'File and folder names to leave out.', placeholder: 'Add a name',
  },
  {
    key: 'aiDocs.hiddenDocTypes', kind: 'hidden-choices', label: 'Groups shown',
    choices: aiDocGroups.map(group => ({ id: group.key, label: group.title })),
  },
];

// Changed by dragging rather than through a field of its own
const positionKey = 'dynamicFolderGroup.position';

const fieldsByKey = new Map<string, SettingField>([...relatedFields, ...aiDocsFields].map(field => [field.key, field]));

function hasWorkspace(): boolean {
  return (workspace.workspaceFolders?.length ?? 0) > 0;
}

const extensionId = 'josephbergevin.codebook-md';

/**
 * ReloadNeededError is thrown when a setting cannot be written because the
 * window has not picked it up yet. After an update, VS Code can restart the
 * extension without reloading the window; the new code then runs against the
 * previous version's list of settings.
 */
export class ReloadNeededError extends Error {
  constructor() {
    super('CodebookMD was updated. Reload the window to change this setting.');
    this.name = 'ReloadNeededError';
  }
}

/** manifestDefault returns the default this extension's package.json declares for a setting. */
function manifestDefault(key: string): unknown {
  const configuration = extensions.getExtension(extensionId)?.packageJSON?.contributes?.configuration;
  // `contributes.configuration` is one section or a list of them
  const sections: unknown[] = Array.isArray(configuration) ? configuration : [configuration];
  for (const section of sections) {
    const properties = (section as { properties?: Record<string, { default?: unknown; }>; } | undefined)?.properties;
    const declared = properties?.[`codebook-md.${key}`];
    if (declared && declared.default !== undefined) {
      return declared.default;
    }
  }
  return undefined;
}

/**
 * settingNeedsReload reports whether a setting is declared by this version of
 * the extension but unknown to the window, which is the case between an
 * update and the next window reload.
 * @param key the key below `codebook-md.`
 */
export function settingNeedsReload(key: string): boolean {
  const inspected = workspace.getConfiguration('codebook-md').inspect<unknown>(key);
  return inspected?.defaultValue === undefined && manifestDefault(key) !== undefined;
}

/** Writes or removes one setting, naming the cause when the window is behind. */
async function updateSetting(key: string, value: unknown, scope: SettingScope): Promise<void> {
  if (settingNeedsReload(key)) {
    throw new ReloadNeededError();
  }
  try {
    await workspace.getConfiguration('codebook-md').update(key, value, targetFor(scope));
  } catch (error) {
    // The same cause, reported by VS Code itself
    if (/not a registered configuration/i.test(error instanceof Error ? error.message : String(error))) {
      throw new ReloadNeededError();
    }
    throw error;
  }
}

/**
 * defaultScope is where a change is written when the UI offers no choice: the
 * workspace when one is open, otherwise the user's own settings.
 */
export function defaultScope(): SettingScope {
  return hasWorkspace() ? 'workspace' : 'user';
}

function targetFor(scope: SettingScope): ConfigurationTarget {
  return scope === 'workspace' && hasWorkspace() ? ConfigurationTarget.Workspace : ConfigurationTarget.Global;
}

/**
 * normalizeSettingValue checks a value that came from a page against its
 * field and puts it in the form that is stored.
 * @returns undefined when the value is not one the field can hold
 */
export function normalizeSettingValue(field: SettingField, value: unknown): unknown {
  switch (field.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'text':
      return typeof value === 'string' ? value.trim().slice(0, maxTextLength) : undefined;
    case 'icon':
      return value === '' || isIconName(value) ? value : undefined;
    case 'list': {
      if (!Array.isArray(value)) {
        return undefined;
      }
      const entries: string[] = [];
      for (const entry of value) {
        const text = typeof entry === 'string' ? entry.trim().slice(0, maxTextLength) : '';
        if (text && !entries.includes(text) && entries.length < maxListEntries) {
          entries.push(text);
        }
      }
      return entries;
    }
    case 'hidden-choices': {
      if (!Array.isArray(value)) {
        return undefined;
      }
      // Stored in the order the choices are listed, whatever order they arrive in
      return (field.choices ?? []).map(choice => choice.id).filter(id => value.includes(id));
    }
  }
}

/** readSetting reads one field as seen from a scope. */
export function readSetting(field: SettingField, scope: SettingScope): SettingState {
  const inspected = workspace.getConfiguration('codebook-md').inspect<unknown>(field.key);
  const workspaceValue = inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
  const userValue = inspected?.globalValue;
  // A window that is behind has no default; the manifest's is the real one
  const declaredDefault = inspected?.defaultValue === undefined ? manifestDefault(field.key) : undefined;
  const defaultValue = inspected?.defaultValue ?? declaredDefault;

  const source: SettingSource = workspaceValue !== undefined ? 'workspace' : (userValue !== undefined ? 'user' : 'default');
  const userView = userValue ?? defaultValue;
  const isUserScope = scope === 'user';
  return {
    ...field,
    value: isUserScope ? userView : (workspaceValue ?? userView),
    defaultValue,
    source,
    isSetInScope: isUserScope ? userValue !== undefined : workspaceValue !== undefined,
    resetsTo: !isUserScope && userValue !== undefined ? 'user' : 'default',
    isOverridden: isUserScope && workspaceValue !== undefined,
    needsReload: declaredDefault !== undefined,
  };
}

/**
 * writeSetting changes one of the settings the UI knows about.
 * @param key the key below `codebook-md.`
 * @returns false when the key or the value is not accepted; nothing is written then
 */
export async function writeSetting(key: unknown, value: unknown, scope: SettingScope): Promise<boolean> {
  const field = typeof key === 'string' ? fieldsByKey.get(key) : undefined;
  if (!field) {
    return false;
  }
  const normalized = normalizeSettingValue(field, value);
  if (normalized === undefined) {
    return false;
  }
  // A name cannot be empty: clearing it goes back to the level below
  const stored = field.kind === 'text' && field.key.endsWith('.name') && normalized === '' ? undefined : normalized;
  await updateSetting(field.key, stored, scope);
  return true;
}

/**
 * resetSetting removes a setting's value at one scope, so the level below
 * applies again: the user value under a workspace value, the default under that.
 * @returns false when the key is not one the UI knows about
 */
export async function resetSetting(key: unknown, scope: SettingScope): Promise<boolean> {
  if (typeof key !== 'string' || !fieldsByKey.has(key)) {
    return false;
  }
  await updateSetting(key, undefined, scope);
  return true;
}

function countFiles(folders: FolderGroupFolder[]): number {
  return (folders ?? []).reduce((total, folder) => total + (folder.files?.length ?? 0) + countFiles(folder.folders ?? []), 0);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function groupSummary(group: FolderGroup): string {
  const folders = group.folders ?? [];
  if (folders.length === 0) {
    return 'Empty';
  }
  return `${plural(folders.length, 'folder')}, ${plural(countFiles(folders), 'file')}`;
}

function handBuiltGroupState(group: FolderGroup, index: number): GroupState {
  return {
    id: `group:${index}`,
    kind: 'yours',
    index,
    name: group.name ?? '',
    description: group.description ?? '',
    icon: isIconName(group.icon) ? group.icon : '',
    hidden: group.hide === true,
    collapsed: group.collapsed === true,
    summary: groupSummary(group),
  };
}

/**
 * relatedPosition clamps the generated group's position to the number of
 * hand-built groups there are.
 */
export function relatedPosition(position: number, groupCount: number): number {
  return Math.min(Math.max(0, Math.floor(position) || 0), groupCount);
}

/**
 * groupStates lists the groups of the My Notebooks view in the order they are
 * shown: the ones in codebook-md.json, with the generated group at its position.
 * Hidden groups are included; the caller decides whether to show them.
 */
export function groupStates(codebookConfig: CodebookConfig, settings: config.DynamicFolderGroupConfig): GroupState[] {
  const groups = (codebookConfig.folderGroups ?? []).map(handBuiltGroupState);
  const related: GroupState = {
    id: relatedGroupId,
    kind: 'auto',
    name: settings.name,
    description: settings.description,
    icon: isIconName(settings.icon) ? settings.icon : '',
    hidden: !settings.enabled,
    collapsed: settings.startCollapsed,
    summary: 'Follows the open file',
  };
  groups.splice(relatedPosition(settings.position, groups.length), 0, related);
  return groups;
}

function configFileLabel(configPath: string): string {
  if (!configPath) {
    return '';
  }
  return path.join(path.basename(path.dirname(configPath)), path.basename(configPath)).replace(/\\/g, '/');
}

/** sideBarState gathers everything the settings panel shows. */
export function sideBarState(scope: SettingScope): SideBarState {
  const configPath = config.getCodebookConfigFilePath();
  const effectiveScope: SettingScope = hasWorkspace() ? scope : 'user';
  const related = relatedFields.map(field => readSetting(field, effectiveScope));
  const aiDocs = aiDocsFields.map(field => readSetting(field, effectiveScope));
  return {
    scope: effectiveScope,
    hasWorkspace: hasWorkspace(),
    configFile: configFileLabel(configPath),
    groups: groupStates(readCodebookConfig(configPath), config.getDynamicFolderGroupConfig()),
    related,
    aiDocs,
    needsReload: [...related, ...aiDocs].some(field => field.needsReload),
    icons: groupIconChoices,
  };
}

/** Reads codebook-md.json, or reports why it cannot be changed. */
function readForWrite(configPath: string): CodebookConfig | undefined {
  if (!configPath || !fs.existsSync(configPath)) {
    return undefined;
  }
  const codebookConfig = readCodebookConfig(configPath);
  return Array.isArray(codebookConfig.folderGroups) ? codebookConfig : undefined;
}

/**
 * updateFolderGroup changes the options of one hand-built folder group in
 * codebook-md.json. Fields the patch does not name are left alone, and so is
 * everything inside the group.
 * @param index the group's position in folderGroups
 * @returns false when there is no such group or the patch holds nothing valid
 */
export function updateFolderGroup(configPath: string, index: unknown, patch: unknown): boolean {
  const codebookConfig = readForWrite(configPath);
  const groups = codebookConfig?.folderGroups;
  if (!codebookConfig || !groups || typeof index !== 'number' || !Number.isInteger(index) || !groups[index]) {
    return false;
  }
  if (typeof patch !== 'object' || patch === null) {
    return false;
  }
  const changes = patch as Record<string, unknown>;
  const group = groups[index];
  let changed = false;

  if (typeof changes.name === 'string') {
    const name = changes.name.trim().slice(0, maxTextLength);
    // A group always has a name; an empty one is ignored
    if (name && name !== group.name) {
      group.name = name;
      changed = true;
    }
  }
  if (typeof changes.description === 'string') {
    const description = changes.description.trim().slice(0, maxTextLength);
    if (description !== (group.description ?? '')) {
      group.description = description;
      changed = true;
    }
  }
  if (changes.icon === '' || isIconName(changes.icon)) {
    if (changes.icon !== (group.icon ?? '')) {
      group.icon = changes.icon;
      changed = true;
    }
  }
  if (typeof changes.hide === 'boolean' && changes.hide !== (group.hide === true)) {
    group.hide = changes.hide;
    changed = true;
  }
  if (typeof changes.collapsed === 'boolean' && changes.collapsed !== (group.collapsed === true)) {
    group.collapsed = changes.collapsed;
    changed = true;
  }

  if (changed) {
    writeCodebookConfig(configPath, codebookConfig);
  }
  return changed;
}

/**
 * applyGroupOrder saves a new order for the groups of the My Notebooks view.
 *
 * The order names every group once: `related` and each `group:<index>` as
 * they are numbered now. Hand-built groups are rewritten in that order in
 * codebook-md.json, and the generated group's place among them is saved as
 * the `dynamicFolderGroup.position` setting.
 * @returns false when the order is not a rearrangement of the current groups
 */
export async function applyGroupOrder(configPath: string, order: unknown, scope: SettingScope): Promise<boolean> {
  if (!Array.isArray(order) || order.some(id => typeof id !== 'string')) {
    return false;
  }
  const ids = order as string[];
  const codebookConfig = readForWrite(configPath);
  const groups = codebookConfig?.folderGroups ?? [];

  const expected = [relatedGroupId, ...groups.map((_, index) => `group:${index}`)];
  const isRearrangement = ids.length === expected.length && expected.every(id => ids.includes(id));
  if (!isRearrangement) {
    return false;
  }

  const position = ids.indexOf(relatedGroupId);
  const settings = config.getDynamicFolderGroupConfig();
  const movesRelated = position !== relatedPosition(settings.position, groups.length);
  // Checked before anything is written, so an order is never half saved
  if (movesRelated && settingNeedsReload(positionKey)) {
    throw new ReloadNeededError();
  }

  const handBuilt = ids.filter(id => id !== relatedGroupId).map(id => Number(id.slice('group:'.length)));
  const isMoved = handBuilt.some((from, to) => from !== to);
  if (codebookConfig && isMoved) {
    codebookConfig.folderGroups = handBuilt.map((from, to) => {
      groups[from].index = to;
      return groups[from];
    });
    writeCodebookConfig(configPath, codebookConfig);
  }

  if (movesRelated) {
    // When the level below already gives this position, the value at this
    // scope is removed rather than repeated
    const inspected = workspace.getConfiguration('codebook-md').inspect<number>(positionKey);
    const below = scope === 'workspace' && hasWorkspace()
      ? (inspected?.globalValue ?? inspected?.defaultValue ?? 0)
      : (inspected?.defaultValue ?? 0);
    await updateSetting(positionKey, position === below ? undefined : position, scope);
  }
  return true;
}
