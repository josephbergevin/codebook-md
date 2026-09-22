import { workspace, WorkspaceConfiguration } from 'vscode';
import { ConfigOption, getLanguageConfigOptions, getOutputConfigOptions } from '../cellConfig';
import { explicitSetting } from '../codebook';

/**
 * The per-cell configuration fields shown in the config modal.
 *
 * Every field knows the value that applies when the cell does not override it
 * (inheritedValue, resolved the same way the runtime resolves it) and the value
 * the cell currently overrides it with, if any (cellValue). The modal saves only
 * the overrides, so a cell keeps following the settings for everything else.
 */

export type FieldType = 'boolean' | 'string' | 'number' | 'select' | 'list';
export type FieldGroup = 'execution' | 'language' | 'output';

// Where the inherited value comes from: a VS Code setting the user has set, or
// the built-in default
export type InheritedSource = 'setting' | 'default';

export interface ConfigField {
  // Dotted path of the value inside the cell config, e.g. 'execCmd',
  // 'output.showTimestamp' or 'execTypeRunConfig.filename'
  id: string;
  group: FieldGroup;
  label: string;
  description: string;
  type: FieldType;
  options?: string[];
  // The VS Code setting behind the inherited value, opened by the gear button
  settingId: string;
  inheritedValue: unknown;
  inheritedSource: InheritedSource;
  // The cell's own value; undefined when the cell does not override the field
  cellValue?: unknown;
  // Only show the field while another field has a given value (Go run/test)
  showWhen?: { field: string; equals: string; };
}

export type GetConfiguration = (section: string) => WorkspaceConfiguration;

const defaultGetConfiguration: GetConfiguration = section => workspace.getConfiguration(section);

// Language ids whose settings live under a different section name
const settingsSections: Record<string, string> = {
  shellscript: 'bash',
  shell: 'bash',
  bash: 'bash',
};

/**
 * settingsSection maps a cell language id to the `codebook-md.<section>` its
 * settings are declared under - shell cells are 'shellscript' but their
 * settings live under 'codebook-md.bash'.
 */
export function settingsSection(languageId: string): string {
  return settingsSections[languageId] ?? languageId;
}

// Languages whose runtime honors a per-cell execution path (Go has its own
// run/test paths, and HTTP always runs from the configured execPath)
const execPathLanguages = new Set(['shellscript', 'python', 'javascript', 'typescript', 'sql']);

// Labels and help for the fields inside Go's object-typed settings
const goSubFields: Record<string, { label: string; description: string; }> = {
  execPath: { label: 'Execution path', description: 'Directory the Go file is written to and run from.' },
  filename: { label: 'Filename', description: 'Name of the generated Go file.' },
  buildTag: { label: 'Build tag', description: 'Build tag added to the generated test file.' },
};

/** getPath reads a dotted path from an object. */
export function getPath(source: Record<string, unknown> | undefined | null, dottedPath: string): unknown {
  let current: unknown = source;
  for (const part of dottedPath.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setPath(target: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function deletePath(target: Record<string, unknown>, dottedPath: string): void {
  const parts = dottedPath.split('.');
  const parent = parts.length === 1 ? target : getPath(target, parts.slice(0, -1).join('.'));
  if (parent && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[parts[parts.length - 1]];
  }
  // Drop the parent object once it is empty, e.g. an 'output' with no overrides
  if (parts.length > 1) {
    const rootKey = parts[0];
    const root = target[rootKey];
    if (root && typeof root === 'object' && !Array.isArray(root) && Object.keys(root).length === 0) {
      delete target[rootKey];
    }
  }
}

/** listToText shows a list setting (e.g. SQL options) as one editable string. */
function listToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(' ');
  }
  return value === undefined || value === null ? '' : String(value);
}

function toDisplayValue(type: FieldType, value: unknown): unknown {
  return type === 'list' ? listToText(value) : value;
}

function fieldType(option: ConfigOption): FieldType {
  switch (option.type) {
    case 'boolean':
    case 'number':
    case 'list':
      return option.type;
    case 'select':
      return option.options ? 'select' : 'string';
    default:
      return 'string';
  }
}

/**
 * buildConfigFields returns the fields the config modal shows for a cell,
 * with the values that apply to it.
 */
export function buildConfigFields(
  languageId: string,
  cellConfig: Record<string, unknown> | null | undefined,
  getConfiguration: GetConfiguration = defaultGetConfiguration,
  options: { inheritedExecPath?: string; } = {},
): ConfigField[] {
  const section = settingsSection(languageId);
  const languageConfig = getConfiguration(`codebook-md.${section}`);
  const fields: ConfigField[] = [];

  if (execPathLanguages.has(languageId)) {
    fields.push({
      id: 'execPath',
      group: 'execution',
      label: 'Execution path',
      description: 'Directory this cell runs in, relative to the workspace folder. Clear it to follow the codebook-md.execPath setting.',
      type: 'string',
      settingId: 'codebook-md.execPath',
      inheritedValue: options.inheritedExecPath ?? '',
      inheritedSource: explicitSetting(getConfiguration('codebook-md'), 'execPath') !== undefined ? 'setting' : 'default',
    });
  }

  for (const [key, option] of Object.entries(getLanguageConfigOptions(languageId))) {
    if (option.internal) {
      continue;
    }

    // Object-typed settings (Go's run/test configs) are edited field by field
    if (option.type === 'object' && typeof option.default === 'object') {
      const inheritedObject = (languageConfig.get<Record<string, unknown>>(key) ?? option.default) as Record<string, unknown>;
      const explicitObject = explicitSetting<Record<string, unknown>>(languageConfig, key);
      for (const subKey of Object.keys(option.default)) {
        const sub = goSubFields[subKey] ?? { label: subKey, description: '' };
        fields.push({
          id: `${key}.${subKey}`,
          group: 'language',
          label: sub.label,
          description: sub.description,
          type: 'string',
          settingId: `codebook-md.${section}.${key}`,
          inheritedValue: inheritedObject[subKey] ?? (option.default as Record<string, unknown>)[subKey],
          inheritedSource: explicitObject?.[subKey] !== undefined ? 'setting' : 'default',
          showWhen: key === 'execTypeTestConfig'
            ? { field: 'execType', equals: 'test' }
            : { field: 'execType', equals: 'run' },
        });
      }
      continue;
    }

    const type = fieldType(option);
    fields.push({
      id: key,
      group: 'language',
      label: option.label ?? key,
      description: option.description,
      type,
      options: option.options,
      settingId: `codebook-md.${section}.${key}`,
      inheritedValue: toDisplayValue(type, languageConfig.get(key) ?? option.default),
      inheritedSource: explicitSetting(languageConfig, key) !== undefined ? 'setting' : 'default',
    });
  }

  // Output settings layer like the runtime's OutputConfig: the global
  // codebook-md.output.* settings, then any codebook-md.<lang>.output.* the user set
  const globalOutput = getConfiguration('codebook-md.output');
  const languageOutput = getConfiguration(`codebook-md.${section}.output`);
  for (const [key, option] of Object.entries(getOutputConfigOptions())) {
    const fromLanguage = explicitSetting(languageOutput, key);
    const fromGlobal = explicitSetting(globalOutput, key);
    fields.push({
      id: `output.${key}`,
      group: 'output',
      label: option.label ?? key,
      description: option.description,
      type: fieldType(option),
      settingId: fromLanguage !== undefined ? `codebook-md.${section}.output.${key}` : `codebook-md.output.${key}`,
      inheritedValue: fromLanguage ?? fromGlobal ?? globalOutput.get(key) ?? option.default,
      inheritedSource: fromLanguage !== undefined || fromGlobal !== undefined ? 'setting' : 'default',
    });
  }

  for (const field of fields) {
    const value = getPath(cellConfig ?? undefined, field.id);
    if (value !== undefined) {
      field.cellValue = toDisplayValue(field.type, value);
    }
  }
  return fields;
}

/**
 * coerceFieldValue converts a value from the modal into the type the runtime
 * reads. Returns undefined for a value that cannot be stored.
 */
export function coerceFieldValue(field: ConfigField, raw: unknown): unknown {
  switch (field.type) {
    case 'boolean':
      return raw === true || raw === 'true';
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(value) ? value : undefined;
    }
    case 'list': {
      // Stored as a one-element list: the runtime joins the list with spaces,
      // so this passes the text through exactly as typed (quotes included)
      const text = listToText(raw).trim();
      return text ? [text] : [];
    }
    case 'select':
      return field.options?.includes(String(raw)) ? String(raw) : undefined;
    case 'string':
      // An empty path means "follow the setting", not "run in the root"
      return field.id === 'execPath' && String(raw).trim() === '' ? undefined : String(raw);
    default:
      return raw === undefined || raw === null ? undefined : String(raw);
  }
}

/**
 * applyFieldOverrides builds the cell config to save: the existing config with
 * every modal-managed field replaced by the given overrides. Anything the modal
 * doesn't manage - notably the execution history - is kept as it is.
 */
export function applyFieldOverrides(
  existing: Record<string, unknown> | null | undefined,
  fields: ConfigField[],
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(existing ?? {}));

  // Clean up what earlier versions of the modal wrote by mistake: flat
  // history-setting keys, and a history array overwritten by an object
  delete next['executionHistory.enabled'];
  delete next['executionHistory.historyLimit'];
  if (next.executionHistory !== undefined && !Array.isArray(next.executionHistory)) {
    delete next.executionHistory;
  }

  for (const field of fields) {
    deletePath(next, field.id);
  }

  for (const [id, raw] of Object.entries(overrides)) {
    const field = fields.find(f => f.id === id);
    if (!field) {
      continue;
    }
    const value = coerceFieldValue(field, raw);
    if (value !== undefined) {
      setPath(next, id, value);
    }
  }
  return next;
}
