import * as path from 'path';
import { readScopePatterns, ruleBaseDir, scopeFolder, scopeFolders, scopeKeys, scopeMatchesFile } from '../docScope';

describe('readScopePatterns', () => {
  test('reads every key the supported tools use', () => {
    expect(scopeKeys).toEqual(['applyTo', 'paths', 'globs', 'fileMatchPattern']);
    for (const key of scopeKeys) {
      expect(readScopePatterns({ [key]: 'src/**' })).toEqual(['src/**']);
    }
  });

  test('splits one string on commas', () => {
    expect(readScopePatterns({ applyTo: 'parser/**, extractor/**' })).toEqual(['parser/**', 'extractor/**']);
  });

  test('keeps commas inside braces with their pattern', () => {
    expect(readScopePatterns({ globs: '**/*.{ts,tsx},docs/**' })).toEqual(['**/*.{ts,tsx}', 'docs/**']);
  });

  test('reads a list', () => {
    expect(readScopePatterns({ paths: ['src/**', 'test/**'] })).toEqual(['src/**', 'test/**']);
  });

  test('drops empty entries and repeats, and a leading ./ or /', () => {
    expect(readScopePatterns({ applyTo: './src/**, ,/src/**', paths: ['src/**'] })).toEqual(['src/**']);
  });

  test('returns nothing when no scope key is present', () => {
    expect(readScopePatterns({ name: 'x', description: 'y' })).toEqual([]);
  });
});

describe('scopeFolder', () => {
  test('is the path before the first wildcard', () => {
    expect(scopeFolder('extractor/**/*.go')).toBe('extractor');
    expect(scopeFolder('src/webview/*.ts')).toBe('src/webview');
    expect(scopeFolder('src/app*.ts')).toBe('src');
  });

  test('is empty, meaning the base folder, for a pattern with no fixed start', () => {
    expect(scopeFolder('**/*.ts')).toBe('');
    expect(scopeFolder('**')).toBe('');
    expect(scopeFolder('*.md')).toBe('');
  });

  test('is the folder itself for a pattern that names a folder', () => {
    expect(scopeFolder('docs/guides')).toBe('docs/guides');
    expect(scopeFolder('docs/')).toBe('docs');
    expect(scopeFolder('.github')).toBe('.github');
  });

  test('is the containing folder for a pattern that names a file', () => {
    expect(scopeFolder('src/config.ts')).toBe('src');
    expect(scopeFolder('README.md')).toBe('');
  });
});

describe('scopeFolders', () => {
  test('lists each folder once', () => {
    expect(scopeFolders(['src/**', 'src/*.ts', 'test/**'])).toEqual(['src', 'test']);
  });

  test('expands a brace group into its folders', () => {
    expect(scopeFolders(['{parser,extractor}/**'])).toEqual(['parser', 'extractor']);
    expect(scopeFolders(['src/{a,b}/**/*.ts'])).toEqual(['src/a', 'src/b']);
  });

  test('leaves a brace group after a wildcard alone', () => {
    expect(scopeFolders(['src/**/*.{ts,tsx}'])).toEqual(['src']);
  });
});

describe('ruleBaseDir', () => {
  const repo = path.join(path.sep, 'work', 'repo');

  test('is the folder that holds the rule folder', () => {
    expect(ruleBaseDir(path.join(repo, '.github', 'instructions', 'go.instructions.md'))).toBe(repo);
    expect(ruleBaseDir(path.join(repo, '.claude', 'rules', 'api', 'go.md'))).toBe(repo);
    expect(ruleBaseDir(path.join(repo, '.kiro', 'steering', 'product.md'))).toBe(repo);
  });

  test('uses the nearest rule folder for a nested project', () => {
    const nested = path.join(repo, 'packages', 'api');
    expect(ruleBaseDir(path.join(nested, '.claude', 'rules', 'go.md'))).toBe(nested);
  });

  test('is undefined for a file outside any rule folder', () => {
    expect(ruleBaseDir(path.join(repo, 'docs', 'rules.md'))).toBeUndefined();
  });
});

describe('scopeMatchesFile', () => {
  const repo = path.join(path.sep, 'work', 'repo');
  const file = (...parts: string[]) => path.join(repo, ...parts);

  test('matches a file its pattern covers', () => {
    expect(scopeMatchesFile(['extractor/**'], repo, file('extractor', 'api', 'debug.md'))).toBe(true);
    expect(scopeMatchesFile(['**/*.ts'], repo, file('src', 'config.ts'))).toBe(true);
  });

  test('does not match a file in the right folder with the wrong extension', () => {
    expect(scopeMatchesFile(['extractor/**/*.go'], repo, file('extractor', 'api', 'debug.md'))).toBe(false);
  });

  test('matches when any one pattern does', () => {
    expect(scopeMatchesFile(['parser/**', 'extractor/**'], repo, file('extractor', 'main.go'))).toBe(true);
  });

  test('reads patterns relative to the base folder', () => {
    expect(scopeMatchesFile(['src/**'], path.join(repo, 'packages', 'api'), file('src', 'config.ts'))).toBe(false);
    expect(scopeMatchesFile(['src/**'], path.join(repo, 'packages', 'api'), file('packages', 'api', 'src', 'x.ts'))).toBe(true);
  });

  test('never matches a file outside the base folder, or no file at all', () => {
    expect(scopeMatchesFile(['**'], repo, path.join(path.sep, 'work', 'other', 'x.ts'))).toBe(false);
    expect(scopeMatchesFile(['**'], repo, '')).toBe(false);
    expect(scopeMatchesFile([], repo, file('src', 'config.ts'))).toBe(false);
  });
});
