import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isExcluded, readDirEntries } from '../dirEntries';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-entries-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readDirEntries', () => {
  test('sorts markdown files, other files and folders by name', () => {
    for (const name of ['b.md', 'A.md', 'run.sh', 'notes.markdown']) {
      fs.writeFileSync(path.join(dir, name), '');
    }
    fs.mkdirSync(path.join(dir, 'zeta'));
    fs.mkdirSync(path.join(dir, 'alpha'));
    expect(readDirEntries(dir, [])).toEqual({
      files: ['A.md', 'b.md', 'notes.markdown'],
      others: ['run.sh'],
      dirs: ['alpha', 'zeta'],
    });
  });

  test('leaves out excluded names, hidden files, node_modules and .git', () => {
    for (const name of ['keep.md', 'skip.tmp.md', '.DS_Store']) {
      fs.writeFileSync(path.join(dir, name), '');
    }
    for (const name of ['node_modules', '.git', 'dist', '.agents']) {
      fs.mkdirSync(path.join(dir, name));
    }
    expect(readDirEntries(dir, ['dist', '*.tmp.md'])).toEqual({ files: ['keep.md'], others: [], dirs: ['.agents'] });
  });

  test('counts a symlink as what it points to, and drops a dangling one', () => {
    fs.writeFileSync(path.join(dir, 'real.md'), '');
    fs.mkdirSync(path.join(dir, 'real-dir'));
    fs.symlinkSync('real.md', path.join(dir, 'link.md'));
    fs.symlinkSync('real-dir', path.join(dir, 'link-dir'));
    fs.symlinkSync('missing.md', path.join(dir, 'broken.md'));
    expect(readDirEntries(dir, [])).toEqual({ files: ['link.md', 'real.md'], others: [], dirs: ['link-dir', 'real-dir'] });
  });

  test('returns undefined for a folder that cannot be read', () => {
    expect(readDirEntries(path.join(dir, 'missing'), [])).toBeUndefined();
  });
});

describe('isExcluded', () => {
  test('matches a whole name', () => {
    expect(isExcluded('dist', ['dist'])).toBe(true);
    expect(isExcluded('dist2', ['dist'])).toBe(false);
  });

  test('treats * as a wildcard and other characters literally', () => {
    expect(isExcluded('notes.tmp.md', ['*.tmp.md'])).toBe(true);
    expect(isExcluded('notesxtmpxmd', ['*.tmp.md'])).toBe(false);
  });

  test('excludes nothing when the list is empty', () => {
    expect(isExcluded('dist', [])).toBe(false);
  });
});
