import * as codebook from '../codebook';

jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
}));

describe('md.ts Test Suite', () => {
  it('permalinkToCodeDocument should return the correct message', () => {
    const permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L15';
    const permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
    const workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
    const codeDoc = codebook.permalinkToCodeDocument(permalink, permalinkPrefix, workspaceRoot);
    expect(codeDoc).toEqual(new codebook.CodeDocument(
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
      9,
      15,
      'ts',
    ));
    expect(codeDoc.absoluteFileLocPos()).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9');
  });

  it('CodeDocument - no file location', () => {
    const line = 'hello';
    const got = codebook.findCodeDocument(line);
    const want = null;
    expect(got).toBe(want);
  });

  it('CodeDocument - file location, no line numbers', () => {
    const line = 'here is a file: ../extension.ts';
    const got = codebook.findCodeDocument(line);
    const want = "../extension.ts";
    expect(got).toBe(want);
  });

  it('CodeDocument - file location with begin line number', () => {
    const line = 'here is a file: (../extension.ts:9)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9';
    expect(got).toBe(want);
  });

  it('CodeDocument - file location with line numbers', () => {
    const line = 'here is a file: (../extension.ts:9-15)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9-15';
    expect(got).toBe(want);
  });

  it('CodeDocument - file location in go', () => {
    const line = '    fmt.Println("./example.ts")';
    const got = codebook.findCodeDocument(line);
    const want = './example.ts';
    expect(got).toBe(want);
  });
});

describe('parseCommandAndArgs', () => {
  it('should parse command and arguments correctly', () => {
    const fullCmd = 'echo "Hello World"';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('echo');
    expect(command.args).toEqual(['Hello World']);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle commands without arguments', () => {
    const fullCmd = 'ls';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('ls');
    expect(command.args).toEqual([]);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle empty command string', () => {
    const fullCmd = '';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('');
    expect(command.args).toEqual([]);
    expect(command.cwd).toBe(cwd);
  });

  it('should handle multiple arguments', () => {
    const fullCmd = 'git commit -m "Initial commit"';
    const cwd = '/Users/tijoe';
    const command = codebook.parseCommandAndArgs(fullCmd, cwd);
    expect(command.command).toBe('git');
    expect(command.args).toEqual(['commit', '-m', 'Initial commit']);
    expect(command.cwd).toBe(cwd);
  });
});

describe('parseCommands', () => {
  it('should parse multiple commands correctly', () => {
    const fullCmd = 'echo "Hello World"\nls -la\n# This is a comment\ngit status';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(3);

    expect(commands[0].command).toBe('echo');
    expect(commands[0].args).toEqual(['Hello World']);
    expect(commands[0].cwd).toBe(cwd);

    expect(commands[1].command).toBe('ls');
    expect(commands[1].args).toEqual(['-la']);
    expect(commands[1].cwd).toBe(cwd);

    expect(commands[2].command).toBe('git');
    expect(commands[2].args).toEqual(['status']);
    expect(commands[2].cwd).toBe(cwd);
  });

  it('should handle empty command string', () => {
    const fullCmd = '';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(0);
  });

  it('should handle commands with only comments', () => {
    const fullCmd = '# This is a comment\n# Another comment';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(0);
  });

  it('should handle commands with leading and trailing whitespace', () => {
    const fullCmd = '  echo "Hello World"  \n  ls -la  ';
    const cwd = '/Users/tijoe';
    const commands = codebook.parseCommands(fullCmd, cwd);
    expect(commands.length).toBe(2);

    expect(commands[0].command).toBe('echo');
    expect(commands[0].args).toEqual(['Hello World']);
    expect(commands[0].cwd).toBe(cwd);

    expect(commands[1].command).toBe('ls');
    expect(commands[1].args).toEqual(['-la']);
    expect(commands[1].cwd).toBe(cwd);
  });
});
