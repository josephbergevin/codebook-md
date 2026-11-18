import { extractFrontMatter, frontMatterString, readFrontMatterFields } from '../frontMatterFields';

describe('extractFrontMatter', () => {
  test('returns the YAML between the markers', () => {
    expect(extractFrontMatter('---\nname: a\n---\n# Title')).toBe('name: a');
  });

  test('returns undefined when the document does not start with a marker', () => {
    expect(extractFrontMatter('# Title\n---\nname: a\n---')).toBeUndefined();
  });

  test('returns undefined when the block is never closed', () => {
    expect(extractFrontMatter('---\nname: a\n# Title')).toBeUndefined();
  });

  test('accepts CRLF line endings and a byte order mark', () => {
    expect(extractFrontMatter(String.fromCharCode(0xFEFF) + '---\r\nname: a\r\n---\r\nbody')).toBe('name: a');
  });
});

describe('readFrontMatterFields', () => {
  const doc = (yaml: string) => `---\n${yaml}\n---\n# Body\n`;

  test('reads scalar fields', () => {
    expect(readFrontMatterFields(doc('name: docker-cleanup\ndescription: "Remove old images"'))).toEqual({
      name: 'docker-cleanup',
      description: 'Remove old images',
    });
  });

  test('returns nothing for a document without front matter', () => {
    expect(readFrontMatterFields('# Just a heading')).toEqual({});
  });

  test('reads block and flow lists', () => {
    expect(readFrontMatterFields(doc('paths:\n  - src/**\n  - "test/**"\nglobs: [a, b]'))).toEqual({
      paths: ['src/**', 'test/**'],
      globs: ['a', 'b'],
    });
  });

  test('folds a > block scalar into one line', () => {
    expect(readFrontMatterFields(doc('description: >\n  Remove stopped containers\n  and dangling images.\nname: x'))).toEqual({
      description: 'Remove stopped containers and dangling images.',
      name: 'x',
    });
  });

  test('keeps the line breaks of a | block scalar', () => {
    expect(readFrontMatterFields(doc('description: |\n  line one\n  line two'))).toEqual({
      description: 'line one\nline two',
    });
  });

  test('joins a plain scalar wrapped onto indented lines', () => {
    expect(readFrontMatterFields(doc('description: Remove stopped containers\n  and dangling images'))).toEqual({
      description: 'Remove stopped containers and dangling images',
    });
  });

  test('skips a nested map but keeps the fields around it', () => {
    expect(readFrontMatterFields(doc('name: a\nmetadata:\n  author: me\n  version: 1\ndescription: b'))).toEqual({
      name: 'a',
      description: 'b',
    });
  });

  test('skips a list of maps', () => {
    expect(readFrontMatterFields(doc('name: a\nhooks:\n  - event: start\n    run: x'))).toEqual({ name: 'a' });
  });

  test('ignores comments', () => {
    expect(readFrontMatterFields(doc('# who\nname: a # inline'))).toEqual({ name: 'a' });
  });

  test('keeps an empty value as an empty string', () => {
    expect(readFrontMatterFields(doc('applyTo:\nname: a'))).toEqual({ applyTo: '', name: 'a' });
  });
});

describe('frontMatterString', () => {
  test('joins a list with commas', () => {
    expect(frontMatterString(['a', 'b'])).toBe('a, b');
  });

  test('returns an empty string for a missing field', () => {
    expect(frontMatterString(undefined)).toBe('');
  });
});
