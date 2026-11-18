import { globLiteralPrefix, globToRegExp, isGlobPattern, matchesGlob, toPosix } from '../glob';

describe('isGlobPattern', () => {
  test('a plain folder name is not a pattern', () => {
    expect(isGlobPattern('.github')).toBe(false);
  });

  test('a path is a pattern', () => {
    expect(isGlobPattern('docs/guides')).toBe(true);
  });

  test('a name with a wildcard is a pattern', () => {
    expect(isGlobPattern('doc*')).toBe(true);
  });
});

describe('matchesGlob', () => {
  test('* stays inside one path segment', () => {
    expect(matchesGlob('docs/a.md', 'docs/*.md')).toBe(true);
    expect(matchesGlob('docs/sub/a.md', 'docs/*.md')).toBe(false);
  });

  test('? matches exactly one character', () => {
    expect(matchesGlob('v1', 'v?')).toBe(true);
    expect(matchesGlob('v10', 'v?')).toBe(false);
  });

  test('a trailing /** matches the folder and everything below it', () => {
    expect(matchesGlob('tooling', 'tooling/**')).toBe(true);
    expect(matchesGlob('tooling/a/b', 'tooling/**')).toBe(true);
    expect(matchesGlob('tooling2', 'tooling/**')).toBe(false);
  });

  test('a leading **/ matches at any depth, including the top', () => {
    expect(matchesGlob('docs', '**/docs')).toBe(true);
    expect(matchesGlob('a/b/docs', '**/docs')).toBe(true);
    expect(matchesGlob('a/docs/b', '**/docs')).toBe(false);
  });

  test('** in the middle spans any number of segments', () => {
    expect(matchesGlob('extractor/main.go', 'extractor/**/*.go')).toBe(true);
    expect(matchesGlob('extractor/a/b/main.go', 'extractor/**/*.go')).toBe(true);
    expect(matchesGlob('parser/main.go', 'extractor/**/*.go')).toBe(false);
  });

  test('braces list alternatives', () => {
    expect(matchesGlob('src/a.ts', 'src/*.{ts,tsx}')).toBe(true);
    expect(matchesGlob('src/a.tsx', 'src/*.{ts,tsx}')).toBe(true);
    expect(matchesGlob('src/a.js', 'src/*.{ts,tsx}')).toBe(false);
  });

  test('character classes match one listed character', () => {
    expect(matchesGlob('v1', 'v[12]')).toBe(true);
    expect(matchesGlob('v3', 'v[12]')).toBe(false);
    expect(matchesGlob('v3', 'v[!12]')).toBe(true);
  });

  test('regex characters in the pattern are literal', () => {
    expect(matchesGlob('.github', '.github')).toBe(true);
    expect(matchesGlob('xgithub', '.github')).toBe(false);
    expect(matchesGlob('a+b(c)', 'a+b(c)')).toBe(true);
  });

  test('backslashes are read as separators', () => {
    expect(matchesGlob('docs\\sub\\a.md', 'docs/**')).toBe(true);
  });
});

describe('globToRegExp', () => {
  test('anchors the whole path', () => {
    expect(globToRegExp('docs').test('my/docs')).toBe(false);
    expect(globToRegExp('docs').test('docs/more')).toBe(false);
  });
});

describe('globLiteralPrefix', () => {
  test('returns the folders before the first wildcard', () => {
    expect(globLiteralPrefix('extractor/**/*.go')).toBe('extractor');
    expect(globLiteralPrefix('a/b/*.md')).toBe('a/b');
  });

  test('returns the whole path when there is no wildcard', () => {
    expect(globLiteralPrefix('docs/guides')).toBe('docs/guides');
  });

  test('returns an empty string when the pattern has no fixed start', () => {
    expect(globLiteralPrefix('**/*.ts')).toBe('');
    expect(globLiteralPrefix('*.md')).toBe('');
  });
});

describe('toPosix', () => {
  test('drops a leading ./ and a trailing slash', () => {
    expect(toPosix('./docs/guides/')).toBe('docs/guides');
  });
});
