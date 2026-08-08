import * as fs from 'fs';
import * as path from 'path';

// These tests read package.json and the source directly rather than importing
// the extension, so they hold whether or not the extension host is available.
// Each one guards a class of drift that shipped undetected before 0.21.5.

const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const configProperties: Record<string, { type?: string; default?: unknown; }> =
  packageJson.contributes.configuration.properties;

describe('contributes.commands matches registerCommand', () => {
  const extensionSource = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
  const registered = [...extensionSource.matchAll(/registerCommand\(\s*'([^']+)'/g)].map(m => m[1]);
  const declared: string[] = packageJson.contributes.commands.map(
    (command: { command: string; }) => command.command);

  it('declares every command that is registered', () => {
    // A registered command with no declaration never reaches the Command Palette.
    expect(registered.filter(command => !declared.includes(command))).toEqual([]);
  });

  it('registers every command that is declared', () => {
    // A declared command with no registration fails with "command not found".
    expect(declared.filter(command => !registered.includes(command))).toEqual([]);
  });

  it('only references commands that exist from menus', () => {
    const menuCommands = Object.values(
      packageJson.contributes.menus as Record<string, { command?: string; }[]>)
      .flat()
      .map(item => item.command)
      .filter((command): command is string => Boolean(command));

    expect(menuCommands.filter(command => !declared.includes(command))).toEqual([]);
  });
});

describe('contributes.configuration is well formed', () => {
  it('declares a default whose type matches the declared type', () => {
    const mismatched = Object.entries(configProperties)
      .filter(([, schema]) => schema.default !== undefined)
      .filter(([, schema]) => {
        const actual = Array.isArray(schema.default) ? 'array' : typeof schema.default;
        return actual !== schema.type;
      })
      .map(([key, schema]) => `${key}: type=${schema.type} default=${JSON.stringify(schema.default)}`);

    expect(mismatched).toEqual([]);
  });

  it('declares settings as flat keys so they appear in the Settings UI', () => {
    // Object-typed settings render as an "Edit in settings.json" link, and their
    // nested defaults are never registered. Only settings that are genuinely a
    // single object value may use type: object, and those need a top-level default.
    const objectSettings = Object.entries(configProperties)
      .filter(([, schema]) => schema.type === 'object');

    objectSettings.forEach(([key, schema]) => {
      expect(schema.default).toBeDefined();
      expect(key).toMatch(/execTypeRunConfig|execTypeTestConfig/);
    });
  });

  it('does not declare a default for per-language output overrides', () => {
    // A registered default at the language layer would shadow the global
    // codebook-md.output.* setting on every read, making it unobservable.
    const withDefaults = Object.entries(configProperties)
      .filter(([key]) => key.includes('.output.') && !key.startsWith('codebook-md.output.'))
      .filter(([, schema]) => schema.default !== undefined)
      .map(([key]) => key);

    expect(withDefaults).toEqual([]);
  });
});

describe('language modules only read declared settings', () => {
  // Catches settings that the code reads but package.json never declares - the
  // class of bug that left SQL unable to run and python.execCmd undiscoverable.
  const languageDir = path.join(repoRoot, 'src', 'languages');

  const cases = fs.readdirSync(languageDir)
    .filter(file => file.endsWith('.ts'))
    .map(file => {
      const source = fs.readFileSync(path.join(languageDir, file), 'utf8');
      const sections = [...source.matchAll(/getConfiguration\(\s*'(codebook-md[^']*)'/g)]
        .map(m => m[1])
        .filter(section => !section.endsWith('.output'));
      // both `config?.get('key')` and `resolveSetting(cell, config, 'key', ...)`
      const keys = [
        ...[...source.matchAll(/\?\.get(?:<[^>]*>)?\(\s*'([^']+)'/g)].map(m => m[1]),
        ...[...source.matchAll(/resolveSetting(?:<[^>]*>)?\([^,]+,[^,]+,\s*'([^']+)'/g)].map(m => m[1]),
      ];
      return { file, sections, keys: [...new Set(keys)] };
    })
    .filter(entry => entry.sections.length > 0 && entry.keys.length > 0);

  it.each(cases)('$file reads only declared settings', ({ sections, keys }) => {
    const undeclared = keys.filter(key =>
      !sections.some(section => `${section}.${key}` in configProperties));

    expect(undeclared).toEqual([]);
  });
});
