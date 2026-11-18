import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearDocMetaCache, docDisplayName, docSizeText, docTooltip, getDocMeta, hasExecutableCodeBlock, relativeLinks,
} from '../docMeta';

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

  test('lists what a scoped rule applies to, before its path', () => {
    expect(docTooltip({ type: 'rule', fields: {} }, '.github/instructions/go.instructions.md', { scope: ['**/*.go', 'cmd/**'] }))
      .toBe('Rule\nApplies to: **/*.go, cmd/**\n.github/instructions/go.instructions.md');
  });

  test('names the other paths to the same file', () => {
    expect(docTooltip({ type: 'instructions', fields: {} }, 'AGENTS.md', { aliases: ['CLAUDE.md'] }))
      .toBe('Agent instructions\nAGENTS.md\nAlso at: CLAUDE.md');
  });
});

describe('docTooltip details', () => {
  test('lists problems first, then scope, size and path', () => {
    const meta = { type: 'rule' as const, fields: {}, size: 6332 };
    expect(docTooltip(meta, '.claude/rules/go.md', { scope: ['**/*.go'], issues: ['Scope "**/*.go" matches no files'] })).toBe(
      'Rule\nProblem: Scope "**/*.go" matches no files\nApplies to: **/*.go\n6.3 KB, about 1,600 tokens\n.claude/rules/go.md'
    );
  });
});

describe('docSizeText', () => {
  test('gives the file size and a rounded token estimate for instruction files and rules', () => {
    expect(docSizeText({ type: 'instructions', fields: {}, size: 6332 })).toBe('6.3 KB, about 1,600 tokens');
    expect(docSizeText({ type: 'rule', fields: {}, size: 18792 })).toBe('18.8 KB, about 4,700 tokens');
    expect(docSizeText({ type: 'instructions', fields: {}, size: 420 })).toBe('420 bytes, about 110 tokens');
  });

  test('says nothing for docs that only load when asked for, or when the size is unknown', () => {
    expect(docSizeText({ type: 'skill', fields: {}, size: 6332 })).toBeUndefined();
    expect(docSizeText({ type: 'instructions', fields: {} })).toBeUndefined();
  });
});

describe('relativeLinks', () => {
  test('lists links and images that point at other files', () => {
    expect(relativeLinks('[a](docs/a.md) ![b](img/b.png "title") [c](<my file.md>)')).toEqual(['docs/a.md', 'img/b.png', 'my file.md']);
  });

  test('drops fragments and queries, and decodes escapes', () => {
    expect(relativeLinks('[a](docs/a.md#setup) [b](b.md?x=1) [c](my%20file.md)')).toEqual(['docs/a.md', 'b.md', 'my file.md']);
  });

  test('leaves out web addresses, mail links, anchors and site-absolute paths', () => {
    expect(relativeLinks('[a](https://x.dev) [b](mailto:a@b.c) [c](#top) [d](/abs/path.md)')).toEqual([]);
  });

  test('does not read links inside fenced or inline code', () => {
    expect(relativeLinks('`[a](a.md)`\n\n```md\n[b](b.md)\n```\n\n[c](c.md)\n')).toEqual(['c.md']);
  });

  test('lists a repeated target once', () => {
    expect(relativeLinks('[a](a.md) [again](a.md)')).toEqual(['a.md']);
  });
});

describe('getDocMeta details for health checks', () => {
  test('records the size, the links and whether the front matter closes', () => {
    const file = write('AGENTS.md', '---\ntitle: A\n---\n[ref](docs/ref.md)\n');
    expect(getDocMeta(file)).toMatchObject({ size: 36, links: ['docs/ref.md'], unclosedFrontMatter: false });
  });

  test('notices front matter that never closes', () => {
    expect(getDocMeta(write('AGENTS.md', '---\ntitle: A\n\n# Body\n')).unclosedFrontMatter).toBe(true);
    expect(getDocMeta(write('notes.md', '# Body\n\n---\n')).unclosedFrontMatter).toBe(false);
  });
});
