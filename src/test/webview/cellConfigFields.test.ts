jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(() => ({ get: jest.fn(), inspect: jest.fn(), update: jest.fn() })),
    workspaceFolders: [],
  },
  window: {
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), clear: jest.fn(), dispose: jest.fn() })),
  },
  languages: { registerHoverProvider: jest.fn() },
  commands: { registerCommand: jest.fn() },
  NotebookCellKind: { Markup: 1, Code: 2 },
}));

import { WorkspaceConfiguration } from 'vscode';
import {
  applyFieldOverrides, buildConfigFields, coerceFieldValue, ConfigField, GetConfiguration, settingsSection,
} from '../../webview/cellConfigFields';

// fakeSettings builds a getConfiguration where `userSet` holds the values the
// user has set (reported by inspect) and `declared` the package.json defaults
function fakeSettings(
  userSet: Record<string, unknown> = {},
  declared: Record<string, unknown> = {},
): GetConfiguration & jest.Mock {
  return jest.fn((section: string) => ({
    get: (key: string, fallback?: unknown) => {
      const full = `${section}.${key}`;
      return userSet[full] ?? declared[full] ?? fallback;
    },
    inspect: (key: string) => {
      const full = `${section}.${key}`;
      return { key: full, globalValue: userSet[full], defaultValue: declared[full] };
    },
    has: () => true,
    update: jest.fn(),
  }) as unknown as WorkspaceConfiguration) as GetConfiguration & jest.Mock;
}

const field = (fields: ConfigField[], id: string): ConfigField => {
  const found = fields.find(f => f.id === id);
  if (!found) {
    throw new Error(`no field ${id}; have ${fields.map(f => f.id).join(', ')}`);
  }
  return found;
};

describe('settingsSection', () => {
  it('maps shell language ids to the bash settings section', () => {
    expect(settingsSection('shellscript')).toBe('bash');
    expect(settingsSection('shell')).toBe('bash');
    expect(settingsSection('go')).toBe('go');
  });
});

describe('buildConfigFields', () => {
  it('reads shell options from codebook-md.bash, not codebook-md.shellscript', () => {
    const settings = fakeSettings({ 'codebook-md.bash.persistentSession': true });
    const fields = buildConfigFields('shellscript', null, settings);

    const session = field(fields, 'persistentSession');
    expect(session.inheritedValue).toBe(true);
    expect(session.inheritedSource).toBe('setting');
    expect(session.settingId).toBe('codebook-md.bash.persistentSession');
    expect(session.cellValue).toBeUndefined();
    expect(settings.mock.calls.map(c => c[0])).not.toContain('codebook-md.shellscript');
  });

  it('reports the built-in default when the user has not set the option', () => {
    const fields = buildConfigFields('shellscript', null, fakeSettings());
    expect(field(fields, 'persistentSession')).toMatchObject({ inheritedValue: false, inheritedSource: 'default' });
  });

  it('layers language output settings over the global ones, as the runtime does', () => {
    const settings = fakeSettings(
      { 'codebook-md.output.showTimestamp': false, 'codebook-md.bash.output.showTimestamp': true },
      { 'codebook-md.output.replaceOutputCell': true },
    );
    const fields = buildConfigFields('shellscript', null, settings);

    expect(field(fields, 'output.showTimestamp')).toMatchObject({
      inheritedValue: true, inheritedSource: 'setting', settingId: 'codebook-md.bash.output.showTimestamp',
    });
    expect(field(fields, 'output.replaceOutputCell')).toMatchObject({
      inheritedValue: true, inheritedSource: 'default', settingId: 'codebook-md.output.replaceOutputCell',
    });
  });

  it('marks the values the cell overrides', () => {
    const fields = buildConfigFields('shellscript', { persistentSession: true, output: { showTimestamp: false } }, fakeSettings());
    expect(field(fields, 'persistentSession').cellValue).toBe(true);
    expect(field(fields, 'output.showTimestamp').cellValue).toBe(false);
    expect(field(fields, 'output.replaceOutputCell').cellValue).toBeUndefined();
  });

  it('shows SQL connection options as text', () => {
    const settings = fakeSettings({ 'codebook-md.sql.execOptions': ['-h', 'localhost'] });
    const fields = buildConfigFields('sql', { execOptions: ['-u root mydb'] }, settings);
    expect(field(fields, 'execOptions')).toMatchObject({
      type: 'list', inheritedValue: '-h localhost', cellValue: '-u root mydb',
    });
  });

  it('splits Go run/test configs into fields that inherit from the setting', () => {
    const settings = fakeSettings({ 'codebook-md.go.execTypeRunConfig': { execPath: './cmd', filename: 'main.go' } });
    const fields = buildConfigFields('go', { execTypeRunConfig: { filename: 'play.go' } }, settings);

    expect(field(fields, 'execTypeRunConfig.execPath')).toMatchObject({
      inheritedValue: './cmd', inheritedSource: 'setting', showWhen: { field: 'execType', equals: 'run' },
    });
    expect(field(fields, 'execTypeRunConfig.filename').cellValue).toBe('play.go');
    expect(field(fields, 'execTypeTestConfig.buildTag')).toMatchObject({
      inheritedValue: 'playground', showWhen: { field: 'execType', equals: 'test' },
    });
    expect(fields.map(f => f.id)).not.toContain('execPath');
  });

  it('offers a per-cell execution path only where the runtime honors it', () => {
    expect(buildConfigFields('python', null, fakeSettings()).map(f => f.id)).toContain('execPath');
    expect(buildConfigFields('http', null, fakeSettings()).map(f => f.id)).not.toContain('execPath');
  });

  it('shows where the cell runs when it has no execution path of its own', () => {
    const fields = buildConfigFields('shellscript', null, fakeSettings(), { inheritedExecPath: 'codebook-md' });
    expect(field(fields, 'execPath').inheritedValue).toBe('codebook-md');
    expect(field(fields, 'execPath').cellValue).toBeUndefined();

    const overridden = buildConfigFields('shellscript', { execPath: 'scripts' }, fakeSettings(), { inheritedExecPath: 'codebook-md' });
    expect(field(overridden, 'execPath').cellValue).toBe('scripts');
  });
});

describe('coerceFieldValue', () => {
  const make = (type: ConfigField['type'], options?: string[]) =>
    ({ id: 'x', type, options } as unknown as ConfigField);

  it('stores booleans as booleans', () => {
    expect(coerceFieldValue(make('boolean'), 'true')).toBe(true);
    expect(coerceFieldValue(make('boolean'), false)).toBe(false);
  });

  it('stores list text as a single entry the runtime joins back unchanged', () => {
    expect(coerceFieldValue(make('list'), ' -u root -p"a b" ')).toEqual(['-u root -p"a b"']);
    expect(coerceFieldValue(make('list'), '')).toEqual([]);
  });

  it('rejects a select value that is not an option', () => {
    expect(coerceFieldValue(make('select', ['run', 'test']), 'test')).toBe('test');
    expect(coerceFieldValue(make('select', ['run', 'test']), 'bogus')).toBeUndefined();
  });

  it('treats an empty execution path as "follow the setting"', () => {
    const execPath = { id: 'execPath', type: 'string' } as unknown as ConfigField;
    expect(coerceFieldValue(execPath, '  ')).toBeUndefined();
    expect(coerceFieldValue(execPath, 'scripts')).toBe('scripts');
    expect(coerceFieldValue({ id: 'execCmd', type: 'string' } as unknown as ConfigField, '')).toBe('');
  });

  it('stores numbers as numbers', () => {
    expect(coerceFieldValue(make('number'), '12')).toBe(12);
    expect(coerceFieldValue(make('number'), 'abc')).toBeUndefined();
  });
});

describe('applyFieldOverrides', () => {
  const history = [{ id: 'h1', code: 'echo hi', output: 'hi', status: 'success' }];

  it('keeps the execution history and saves only the overrides', () => {
    const existing = {
      executionHistory: history,
      persistentSession: false,
      output: { showTimestamp: true, replaceOutputCell: true, showExecutableCodeInOutput: true, timestampTimezone: 'UTC' },
    };
    const fields = buildConfigFields('shellscript', existing, fakeSettings());
    const saved = applyFieldOverrides(existing, fields, { persistentSession: true, 'output.showTimestamp': false });

    expect(saved).toEqual({
      executionHistory: history,
      persistentSession: true,
      output: { showTimestamp: false },
    });
  });

  it('removes every override when nothing is overridden', () => {
    const existing = { executionHistory: history, execPath: './x', output: { showTimestamp: false } };
    const fields = buildConfigFields('shellscript', existing, fakeSettings());
    expect(applyFieldOverrides(existing, fields, {})).toEqual({ executionHistory: history });
  });

  it('cleans up what the old modal wrote by mistake', () => {
    const existing = {
      executionHistory: { historyLimit: '10' },
      'executionHistory.enabled': true,
      execCmd: 'psql',
    };
    const fields = buildConfigFields('sql', existing, fakeSettings());
    expect(applyFieldOverrides(existing, fields, { execOptions: '-d app' })).toEqual({ execOptions: ['-d app'] });
  });

  it('writes Go sub-fields into their config object', () => {
    const fields = buildConfigFields('go', null, fakeSettings());
    expect(applyFieldOverrides(null, fields, { execType: 'test', 'execTypeTestConfig.buildTag': 'integration' }))
      .toEqual({ execType: 'test', execTypeTestConfig: { buildTag: 'integration' } });
  });

  it('ignores ids that are not fields of this language', () => {
    const fields = buildConfigFields('python', null, fakeSettings());
    expect(applyFieldOverrides({}, fields, { persistentSession: true, 'output.bogus': 1 })).toEqual({});
  });
});
