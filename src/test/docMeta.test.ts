import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clearDocMetaCache, docDisplayName, docTooltip, getDocMeta, hasExecutableCodeBlock } from '../docMeta';

let dir: string;

function write(relativePath: string, content: string): string {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-docmeta-'));
  clearDocMetaCache();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('hasExecutableCodeBlock', () => {
  test('finds a fenced block in a runnable language', () => {
    expect(hasExecutableCodeBlock('# T\n\n```bash\nls\n```\n')).toBe(true);
  });

  test('accepts language aliases and tilde fences', () => {
    expect(hasExecutableCodeBlock('~~~py\nprint(1)\n~~~\n')).toBe(true);
  });

  test('ignores blocks in languages that cannot run', () => {
    expect(hasExecutableCodeBlock('```json\n{}\n```\n\n```mermaid\ngraph TD\n```\n')).toBe(false);
  });

  test('ignores a fence shown inside another block', () => {
    expect(hasExecutableCodeBlock('````markdown\n```bash\nls\n```\n````\n')).toBe(false);
  });

  test('ignores a block with no language', () => {
    expect(hasExecutableCodeBlock('```\nls\n```\n')).toBe(false);
  });
});

describe('getDocMeta', () => {
  test('reads name and description from front matter', () => {
    const file = write('.agents/skills/x/SKILL.md', '---\nname: x\ndescription: Does x.\n---\n');
    expect(getDocMeta(file)).toMatchObject({ type: 'skill', name: 'x', description: 'Does x.' });
  });

  test('classifies plain markdown with runnable code as a notebook', () => {
    const file = write('notes.md', '```go\nfmt.Println()\n```\n');
    expect(getDocMeta(file).type).toBe('notebook');
  });

  test('keeps the type from the path even when the file has runnable code', () => {
    const file = write('README.md', '```bash\nnpm i\n```\n');
    expect(getDocMeta(file).type).toBe('readme');
  });

  test('classifies a missing file by its path, without logging', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(getDocMeta(path.join(dir, 'CHANGELOG.md'))).toEqual({ type: 'changelog', fields: {} });
    expect(log).not.toHaveBeenCalled();
  });

  test('returns the cached result while the file is unchanged', () => {
    const file = write('notes.md', '# One\n');
    expect(getDocMeta(file)).toBe(getDocMeta(file));
  });

  test('forgets cached results when the cache is cleared', () => {
    const file = write('notes.md', '# One\n');
    const before = getDocMeta(file);
    clearDocMetaCache();
    expect(getDocMeta(file)).not.toBe(before);
  });

  test('reads the file again after it changes', () => {
    const file = write('agent.md', '---\ntitle: One\n---\n');
    expect(getDocMeta(file).title).toBe('One');
    fs.writeFileSync(file, '---\ntitle: Two two\n---\n', 'utf8');
    expect(getDocMeta(file).title).toBe('Two two');
  });
});

describe('docDisplayName', () => {
  test('turns an agent doc\'s name into a title', () => {
    expect(docDisplayName('/r/.agents/skills/a-b/SKILL.md', { type: 'skill', name: 'docker-cleanup', fields: {} }, 'Skill'))
      .toBe('Docker Cleanup');
  });

  test('prefers a title, as written', () => {
    expect(docDisplayName('/r/x.prompt.md', { type: 'prompt', name: 'a-b', title: 'Release notes', fields: {} }, 'X Prompt'))
      .toBe('Release notes');
  });

  test('names a skill without front matter after its folder', () => {
    expect(docDisplayName('/r/.agents/skills/pr-watch/SKILL.md', { type: 'skill', fields: {} }, 'Skill')).toBe('Pr Watch');
  });

  test('keeps the file-based name for an agent doc without front matter', () => {
    expect(docDisplayName('/r/AGENTS.md', { type: 'instructions', fields: {} }, 'Agents')).toBe('Agents');
  });

  test('never renames a file that is not an agent doc', () => {
    expect(docDisplayName('/r/guide.md', { type: 'markdown', title: 'The Guide', fields: {} }, 'Guide')).toBe('Guide');
  });
});

describe('docTooltip', () => {
  test('lists the type, exact name, description and path', () => {
    expect(docTooltip({ type: 'skill', name: 'a-b', description: 'Does it.', fields: {} }, '.agents/skills/a-b/SKILL.md'))
      .toBe('Skill: a-b\nDoes it.\n.agents/skills/a-b/SKILL.md');
  });

  test('shows the description and path of a plain markdown file', () => {
    expect(docTooltip({ type: 'markdown', description: 'Notes.', fields: {} }, 'docs/notes.md')).toBe('Notes.\ndocs/notes.md');
  });

  test('names the other paths to the same file', () => {
    expect(docTooltip({ type: 'instructions', fields: {} }, 'AGENTS.md', ['CLAUDE.md']))
      .toBe('Agent instructions\nAGENTS.md\nAlso at: CLAUDE.md');
  });
});
