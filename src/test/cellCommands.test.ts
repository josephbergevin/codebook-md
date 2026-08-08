/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

(vscode.window as any).showWarningMessage = jest.fn();

import { CodeBlockConfig, OutputConfig, parseExecPathCommand, resolveSetting } from '../codebook';

// The values the global output config reports, which availableCommands() enumerates.
const OUTPUT_KEYS = {
  showExecutableCodeInOutput: false,
  replaceOutputCell: true,
  showTimestamp: false,
  timestampTimezone: 'UTC',
};

function installSettings(tree: Record<string, Record<string, unknown>> = {}): void {
  (vscode.workspace.getConfiguration as unknown as jest.Mock).mockImplementation(
    (section: string) => {
      const values = tree[section] ?? (section === 'codebook-md.output' ? OUTPUT_KEYS : {});
      const config: any = {
        get: (key: string, defaultValue?: unknown) =>
          key in values ? (values as any)[key] : defaultValue,
        update: jest.fn(),
      };
      // WorkspaceConfiguration exposes its values as own properties too, which is
      // what availableCommands() reads via JSON.stringify.
      Object.assign(config, values);
      return config;
    }
  );
}

const cell = (content: string, languageId = 'shellscript') => ({
  index: 0,
  kind: 2,
  metadata: {},
  notebook: undefined,
  document: { languageId, getText: () => content, uri: { fsPath: '/ws/test.md' } },
} as any);

beforeEach(() => {
  installSettings();
  (vscode.window.showWarningMessage as jest.Mock).mockClear();
});

describe('parseExecPathCommand', () => {
  it.each([
    ['.execPath("./sub")', './sub'],
    ['.execPath("/abs/path")', '/abs/path'],
    ['.execPath( "./spaced" )', './spaced'],
    ['.execPath: ./sub', './sub'],
    ['.execPath:./sub', './sub'],
    ['.execPath("")', ''],
    ['.execPath', ''],
  ])('parses %s', (command, expected) => {
    expect(parseExecPathCommand([command])).toBe(expected);
  });

  it('returns empty when no execPath command is present', () => {
    expect(parseExecPathCommand(['.output.showTimestamp(true)'])).toBe('');
  });
});

describe('in-cell output commands', () => {
  it('applies a boolean command', () => {
    const config = new OutputConfig(undefined, ['.output.showTimestamp(true)']);
    expect(config.showTimestamp).toBe(true);
  });

  it('applies a false command over a global true', () => {
    installSettings({ 'codebook-md.output': { ...OUTPUT_KEYS, showTimestamp: true } });
    const config = new OutputConfig(undefined, ['.output.showTimestamp(false)']);
    expect(config.showTimestamp).toBe(false);
  });

  it('applies a quoted timezone command', () => {
    const config = new OutputConfig(undefined, ['.output.timestampTimezone("MDT")']);
    expect(config.timestampTimezone).toBe('America/Denver');
  });

  it('wins over the cell config saved by the modal', () => {
    const config = new OutputConfig(
      undefined,
      ['.output.showTimestamp(true)'],
      { output: { showTimestamp: false } }
    );
    expect(config.showTimestamp).toBe(true);
  });

  it('warns on an unknown output key', () => {
    new OutputConfig(undefined, ['.output.notAThing(true)']);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('output command unknown')
    );
  });

  it('warns when a boolean command is given a non-boolean value', () => {
    new OutputConfig(undefined, ['.output.showTimestamp(yes)']);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('expects true or false')
    );
  });
});

describe('availableCommands round-trip', () => {
  // The strings the config modal inserts into a cell must be understood by the
  // parsers. This is the regression guard for the modal/parser syntax drift.
  it('every suggested output command changes the resolved config', () => {
    const suggestions = new CodeBlockConfig(cell('echo hi'), undefined, '#')
      .availableCommands()
      .filter(command => command.startsWith('.output.'));

    expect(suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestions) {
      (vscode.window.showWarningMessage as jest.Mock).mockClear();
      // flip booleans so the command differs from the default it was rendered from
      const command = suggestion.replace('(true)', '(false)');
      const config = new OutputConfig(undefined, [command]);

      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();

      if (command.includes('timestampTimezone')) {
        expect(config.timestampTimezone).toBe('UTC');
      } else {
        const key = command.slice('.output.'.length, command.indexOf('('));
        expect((config as any)[key]).toBe(false);
      }
    }
  });

  it('suggests an execPath command that parses back to a real path', () => {
    const suggestion = new CodeBlockConfig(cell('echo hi'), undefined, '#')
      .availableCommands()
      .find(command => command.startsWith('.execPath'));

    expect(suggestion).toBeDefined();
    expect(parseExecPathCommand([suggestion as string])).toBe('./relative/path');
  });

  it('does not re-suggest a command the cell already sets', () => {
    const config = new CodeBlockConfig(
      cell('# [>].output.showTimestamp(true)\necho hi'), undefined, '#');

    expect(config.availableCommands()).not.toContain('.output.showTimestamp(true)');
  });

  it('suggests Go commands with values its parsers accept', () => {
    const suggestions = new CodeBlockConfig(cell('fmt.Println("hi")', 'go'), undefined, '//')
      .availableCommands();

    const goRun = suggestions.find(c => c.startsWith('.execTypeRunFilename'));
    expect(goRun).toBe('.execTypeRunFilename("main.go")');
    // languages/go.ts requires a non-empty value: /\.execTypeRunFilename\("([^"]+)"\)/
    expect(goRun).toMatch(/\.execTypeRunFilename\("([^"]+)"\)/);
  });
});

describe('CodeBlockConfig execPath', () => {
  it('resolves the canonical quoted form', () => {
    const config = new CodeBlockConfig(cell('# [>].execPath("./sub")\necho hi'), undefined, '#');
    expect(config.execPath).toBe('./sub');
  });

  it('resolves the legacy colon form', () => {
    const config = new CodeBlockConfig(cell('# [>].execPath: ./sub\necho hi'), undefined, '#');
    expect(config.execPath).toBe('./sub');
  });

  it('treats the empty placeholder as unset', () => {
    const config = new CodeBlockConfig(cell('# [>].execPath("")\necho hi'), undefined, '#');
    expect(config.execPath).toBe('');
  });

  it('warns about a command no parser claims', () => {
    new CodeBlockConfig(cell('# [>].bogusCommand(true)\necho hi'), undefined, '#');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('unknown command')
    );
  });
});

describe('resolveSetting', () => {
  it('prefers the cell config over the language settings', () => {
    const languageConfig = vscode.workspace.getConfiguration('codebook-md.python');
    (languageConfig as any).get = () => 'python3';
    expect(resolveSetting({ execCmd: 'python3.12' }, languageConfig, 'execCmd', 'python3'))
      .toBe('python3.12');
  });

  it('falls back to the language settings when the cell says nothing', () => {
    const languageConfig = vscode.workspace.getConfiguration('codebook-md.python');
    (languageConfig as any).get = () => 'python3.9';
    expect(resolveSetting({}, languageConfig, 'execCmd', 'python3')).toBe('python3.9');
  });

  it('falls back to the default when neither layer sets it', () => {
    const languageConfig = vscode.workspace.getConfiguration('codebook-md.python');
    (languageConfig as any).get = () => undefined;
    expect(resolveSetting(undefined, languageConfig, 'execCmd', 'python3')).toBe('python3');
  });

  it('honors an explicit false from the cell config', () => {
    const languageConfig = vscode.workspace.getConfiguration('codebook-md.http');
    (languageConfig as any).get = () => true;
    expect(resolveSetting({ verbose: false }, languageConfig, 'verbose', true)).toBe(false);
  });
});
