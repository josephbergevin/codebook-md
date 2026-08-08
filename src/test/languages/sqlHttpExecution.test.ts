/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

(vscode.window as any).showWarningMessage = jest.fn();
(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/ws' } }];

jest.mock('../../io', () => ({
  writeDirAndFileSyncSafe: jest.fn(),
  mkdirIfNotExistsSafe: jest.fn(),
  spawnSafe: jest.fn(),
  spawnSyncSafe: jest.fn(),
  commandNotOnPath: jest.fn().mockReturnValue(false),
  getMergedEnvironmentVariables: jest.fn(() => ({})),
}));

import * as io from '../../io';
import * as cellConfigModule from '../../cellConfig';
import * as sql from '../../languages/sql';
import * as http from '../../languages/http';

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

const cell = (content: string, languageId: string) => ({
  index: 0,
  kind: 2,
  metadata: {},
  notebook: undefined,
  document: { languageId, getText: () => content, uri: { fsPath: '/ws/test.md' } },
} as any);

// runBeforeExecute invokes an executable's registered setup funcs and returns
// the (dir, file, contents) tuples that were written.
function runBeforeExecute(executable: any): Array<[string, string, string]> {
  (io.writeDirAndFileSyncSafe as jest.Mock).mockClear();
  executable.beforeExecuteFuncs.forEach((fn: () => void) => fn());
  return (io.writeDirAndFileSyncSafe as jest.Mock).mock.calls as Array<[string, string, string]>;
}

beforeEach(() => {
  jest.clearAllMocks();
  installSettings({});
});

describe('SQL execution', () => {
  it('guides the user when no execCmd is configured', () => {
    installSettings({ 'codebook-md.sql': {} });

    const cellUnderTest = new sql.Cell(cell('SELECT 1;', 'sql'));

    expect(cellUnderTest.mainExecutable.command).toBe('echo');
    expect(cellUnderTest.mainExecutable.args[0]).toContain('codebook-md.sql.execCmd');
  });

  it('builds a runnable script when execCmd is configured', () => {
    installSettings({ 'codebook-md.sql': { execCmd: 'mysql', execOptions: ['--defaults-file=~/.my.cnf'] } });

    const cellUnderTest = new sql.Cell(cell('SELECT 1;', 'sql'));

    expect(cellUnderTest.executableCode).toContain('mysql --defaults-file=~/.my.cnf -e "SELECT 1;"');
    // no stray leading flag - the regression that made every SQL cell fail
    expect(cellUnderTest.executableCode).not.toMatch(/\n -e /);
  });

  it('runs each statement exactly once', () => {
    installSettings({ 'codebook-md.sql': { execCmd: 'mysql' } });

    const cellUnderTest = new sql.Cell(cell('SELECT 1;\nSELECT 2;\nSELECT 3;', 'sql'));
    const scripts = [
      cellUnderTest.executableCode,
      ...cellUnderTest.postExecutables.map(executable => runBeforeExecute(executable)[0][2]),
    ];

    expect(scripts).toHaveLength(3);
    scripts.forEach((script, index) => {
      expect(script.match(/-e "/g)).toHaveLength(1);
      expect(script).toContain(`SELECT ${index + 1};`);
    });
    // statement 1 must not reappear in the later statements' scripts
    expect(scripts[1]).not.toContain('SELECT 1;');
    expect(scripts[2]).not.toContain('SELECT 1;');
  });

  it('reads execCmd from the cell config when set there', () => {
    installSettings({ 'codebook-md.sql': { execCmd: 'mysql' } });
    const notebookCell = cell('SELECT 1;', 'sql');
    notebookCell.notebook = { uri: { fsPath: '/ws/test.md' } };
    jest.spyOn(cellConfigModule, 'loadNotebookConfig')
      .mockReturnValue({ '0': { config: { execCmd: 'psql' } } });

    const cellUnderTest = new sql.Cell(notebookCell);

    expect(cellUnderTest.executableCode).toContain('psql');
    jest.restoreAllMocks();
  });
});

describe('HTTP execution', () => {
  it('sends a GET request without a body', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl' } });

    const cellUnderTest = new http.Cell(cell('GET https://example.com', 'http'));

    expect(cellUnderTest.executableCode).toContain('curl -X GET "https://example.com"');
    expect(cellUnderTest.executableCode).not.toContain('--data-binary');
  });

  it('sends a POST body rather than parsing it as a header', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl' } });

    const cellUnderTest = new http.Cell(cell(
      'POST https://api.example.com/data\n' +
      'Content-Type: application/json\n' +
      '\n' +
      '{\n  "name": "Example",\n  "value": 123\n}',
      'http'));

    expect(cellUnderTest.executableCode).toContain(`--data-binary @${http.BodyFilename}`);
    expect(cellUnderTest.executableCode).toContain('-H "Content-Type: application/json"');
    // the body must not have leaked into the headers
    expect(cellUnderTest.executableCode).not.toContain('-H "{');
  });

  it('writes the body to disk before executing', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl' } });

    const cellUnderTest = new http.Cell(cell(
      'POST https://api.example.com/data\nContent-Type: application/json\n\n{"a":1}', 'http'));
    const writes = runBeforeExecute(cellUnderTest.mainExecutable);

    const bodyWrite = writes.find(([, file]) => file.includes(http.BodyFilename));
    expect(bodyWrite).toBeDefined();
    expect(bodyWrite?.[2]).toBe('{"a":1}');
  });

  it('keeps blank lines inside the body', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl' } });

    const cellUnderTest = new http.Cell(cell(
      'POST https://api.example.com/data\n\nline one\n\nline three', 'http'));
    const writes = runBeforeExecute(cellUnderTest.mainExecutable);

    expect(writes.find(([, file]) => file.includes(http.BodyFilename))?.[2])
      .toBe('line one\n\nline three');
  });

  it('honors verbose: false', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl', verbose: false } });

    const cellUnderTest = new http.Cell(cell('GET https://example.com', 'http'));

    expect(cellUnderTest.executableCode).not.toContain(' -v');
  });

  it('escapes quotes in header values', () => {
    installSettings({ 'codebook-md.http': { execCmd: 'curl' } });

    const cellUnderTest = new http.Cell(cell(
      'GET https://example.com\nAuthorization: Bearer "token"', 'http'));

    expect(cellUnderTest.executableCode).toContain('\\"token\\"');
  });
});
