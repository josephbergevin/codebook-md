/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

(vscode.window as any).showWarningMessage = jest.fn();

import { OutputConfig } from '../codebook';

// installSettings replaces the vscode mock's getConfiguration with one backed by
// a plain object tree, so tests can describe the exact settings state they mean.
function installSettings(tree: Record<string, Record<string, unknown>>): void {
  (vscode.workspace.getConfiguration as unknown as jest.Mock).mockImplementation(
    (section: string) => {
      const values = tree[section] ?? {};
      return {
        get: (key: string, defaultValue?: unknown) =>
          key in values ? values[key] : defaultValue,
        update: jest.fn(),
      };
    }
  );
}

const languageConfig = (section: string) => vscode.workspace.getConfiguration(section);

describe('OutputConfig - global settings', () => {
  it('honors an explicit false for every boolean setting', () => {
    installSettings({
      'codebook-md.output': {
        showExecutableCodeInOutput: false,
        replaceOutputCell: false,
        showTimestamp: false,
      },
    });

    const config = new OutputConfig(undefined, []);

    expect(config.showExecutableCodeInOutput).toBe(false);
    expect(config.replaceOutputCell).toBe(false);
    expect(config.showTimestamp).toBe(false);
  });

  it('honors an explicit true for every boolean setting', () => {
    installSettings({
      'codebook-md.output': {
        showExecutableCodeInOutput: true,
        replaceOutputCell: true,
        showTimestamp: true,
      },
    });

    const config = new OutputConfig(undefined, []);

    expect(config.showExecutableCodeInOutput).toBe(true);
    expect(config.replaceOutputCell).toBe(true);
    expect(config.showTimestamp).toBe(true);
  });

  it('falls back to the defaults declared in package.json when nothing is set', () => {
    installSettings({ 'codebook-md.output': {} });

    const config = new OutputConfig(undefined, []);

    expect(config.showExecutableCodeInOutput).toBe(true);
    expect(config.replaceOutputCell).toBe(true);
    expect(config.showTimestamp).toBe(true);
    expect(config.timestampTimezone).toBe('UTC');
  });
});

describe('OutputConfig - language settings override global settings', () => {
  it('lets a language-level false turn off a global true', () => {
    installSettings({
      'codebook-md.output': { showTimestamp: true, replaceOutputCell: true },
      'codebook-md.go.output': { showTimestamp: false, replaceOutputCell: false },
    });

    const config = new OutputConfig(languageConfig('codebook-md.go.output'), []);

    expect(config.showTimestamp).toBe(false);
    expect(config.replaceOutputCell).toBe(false);
  });

  it('lets a language-level true turn on a global false', () => {
    installSettings({
      'codebook-md.output': { showTimestamp: false },
      'codebook-md.go.output': { showTimestamp: true },
    });

    const config = new OutputConfig(languageConfig('codebook-md.go.output'), []);

    expect(config.showTimestamp).toBe(true);
  });

  it('leaves the global value alone for keys the language does not set', () => {
    installSettings({
      'codebook-md.output': { showTimestamp: true, showExecutableCodeInOutput: true },
      'codebook-md.go.output': { showTimestamp: false },
    });

    const config = new OutputConfig(languageConfig('codebook-md.go.output'), []);

    expect(config.showTimestamp).toBe(false);
    expect(config.showExecutableCodeInOutput).toBe(true);
  });

  it('applies a language-level timezone', () => {
    installSettings({
      'codebook-md.output': { timestampTimezone: 'UTC' },
      'codebook-md.go.output': { timestampTimezone: 'America/Denver' },
    });

    const config = new OutputConfig(languageConfig('codebook-md.go.output'), []);

    expect(config.timestampTimezone).toBe('America/Denver');
  });

  it('maps a daylight-time abbreviation to its IANA zone', () => {
    // 'MST'/'PST'/'EST'/'CST' are themselves valid IANA zones and pass through
    // untouched; only the daylight variants need the lookup table.
    installSettings({
      'codebook-md.output': {},
      'codebook-md.go.output': { timestampTimezone: 'MDT' },
    });

    const config = new OutputConfig(languageConfig('codebook-md.go.output'), []);

    expect(config.timestampTimezone).toBe('America/Denver');
  });
});

describe('OutputConfig - cell config overrides language settings', () => {
  it('lets a cell-level false turn off a language-level true', () => {
    installSettings({
      'codebook-md.output': { showTimestamp: false },
      'codebook-md.go.output': { showTimestamp: true },
    });

    const config = new OutputConfig(
      languageConfig('codebook-md.go.output'),
      [],
      { output: { showTimestamp: false } }
    );

    expect(config.showTimestamp).toBe(false);
  });

  it('resolves the full global -> language -> cell chain', () => {
    installSettings({
      'codebook-md.output': { showTimestamp: true },
      'codebook-md.go.output': { showTimestamp: false },
    });

    const config = new OutputConfig(
      languageConfig('codebook-md.go.output'),
      [],
      { output: { showTimestamp: true } }
    );

    expect(config.showTimestamp).toBe(true);
  });

  it('reads prepend/append strings, which only the cell layer provides', () => {
    installSettings({ 'codebook-md.output': {} });

    const config = new OutputConfig(undefined, [], {
      output: {
        prependToOutputStrings: ['before'],
        appendToOutputStrings: ['after'],
      },
    });

    expect(config.prependToOutputStrings).toEqual(['before']);
    expect(config.appendToOutputStrings).toEqual(['after']);
  });
});
