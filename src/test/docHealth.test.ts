import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { docIssues, duplicateSkillIssues, maxSkillDescriptionLength } from '../docHealth';
import { clearDocMetaCache, getDocMeta } from '../docMeta';

let root: string;

function write(relativePath: string, content = '# Doc\n'): string {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

/** Writes a doc and returns the problems found in it. */
function issuesOf(relativePath: string, content: string): string[] {
  const file = write(relativePath, content);
  return docIssues(file, getDocMeta(file));
}

const skill = (frontMatter: string, body = '# Skill\n') => `---\n${frontMatter}\n---\n${body}`;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-health-')));
  clearDocMetaCache();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('docIssues for a skill', () => {
  test('finds nothing wrong with a complete skill', () => {
    expect(issuesOf('.agents/skills/deploy/SKILL.md', skill('name: deploy\ndescription: Ship it.'))).toEqual([]);
  });

  test('flags a missing name and a missing description', () => {
    expect(issuesOf('.agents/skills/deploy/SKILL.md', '# Deploy\n')).toEqual([
      'No name in the front matter',
      'No description in the front matter',
    ]);
  });

  test('flags a name that differs from the folder', () => {
    expect(issuesOf('.agents/skills/deploy/SKILL.md', skill('name: ship\ndescription: Ship it.')))
      .toEqual(['Name "ship" differs from its folder "deploy"']);
  });

  test('flags a description over the limit', () => {
    const long = 'x'.repeat(maxSkillDescriptionLength + 1);
    expect(issuesOf('.agents/skills/deploy/SKILL.md', skill(`name: deploy\ndescription: ${long}`)))
      .toEqual(['Description is 1,025 characters; the limit is 1,024']);
  });

  test('reports front matter that never closes on its own', () => {
    expect(issuesOf('.agents/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: Ship it.\n\n# Deploy\n'))
      .toEqual(['Front matter never closes: the second --- is missing']);
  });
});

describe('docIssues for links', () => {
  test('flags a relative link to a file that does not exist', () => {
    write('.agents/references/real.md');
    const content = '[ok](.agents/references/real.md) [gone](docs/gone.md) [web](https://example.com) [top](#top)\n';
    expect(issuesOf('AGENTS.md', content)).toEqual(['Links to a file that does not exist: docs/gone.md']);
  });

  test('does not read links shown inside code', () => {
    expect(issuesOf('AGENTS.md', 'Use `[x](missing.md)`.\n\n```md\n[y](also-missing.md)\n```\n')).toEqual([]);
  });

  test('accepts a link with a fragment or an encoded space', () => {
    write('docs/my guide.md');
    expect(issuesOf('AGENTS.md', '[a](docs/my%20guide.md#setup) [b](<docs/my guide.md>)\n')).toEqual([]);
  });

  test('names three broken links and counts the rest', () => {
    const content = ['a', 'b', 'c', 'd', 'e'].map(name => `[${name}](${name}.md)`).join(' ');
    expect(issuesOf('AGENTS.md', content)).toEqual([
      'Links to a file that does not exist: a.md',
      'Links to a file that does not exist: b.md',
      'Links to a file that does not exist: c.md',
      '2 more links point at files that do not exist',
    ]);
  });
});

describe('docIssues for a scoped rule', () => {
  const rule = (applyTo: string) => `---\napplyTo: "${applyTo}"\n---\n`;

  test('finds nothing wrong when the pattern matches a file', () => {
    write('extractor/main.go', '');
    expect(issuesOf('.github/instructions/go.instructions.md', rule('extractor/**/*.go'))).toEqual([]);
  });

  test('flags a pattern whose folder does not exist', () => {
    expect(issuesOf('.github/instructions/go.instructions.md', rule('parser/**')))
      .toEqual(['Scope "parser/**" names a folder that does not exist: parser']);
  });

  test('flags a pattern that matches no files', () => {
    write('extractor/readme.md');
    expect(issuesOf('.github/instructions/go.instructions.md', rule('extractor/**/*.go')))
      .toEqual(['Scope "extractor/**/*.go" matches no files']);
  });

  test('flags a pattern that names a path that does not exist', () => {
    expect(issuesOf('.github/instructions/one.instructions.md', rule('src/config.ts')))
      .toEqual(['Scope "src/config.ts" names a path that does not exist']);
  });

  test('checks each pattern on its own', () => {
    write('extractor/main.go', '');
    expect(issuesOf('.github/instructions/go.instructions.md', rule('extractor/**,parser/**')))
      .toEqual(['Scope "parser/**" names a folder that does not exist: parser']);
  });
});

describe('docIssues for other files', () => {
  test('holds only agent docs to these rules', () => {
    expect(issuesOf('docs/notes.md', '[gone](missing.md)\n')).toEqual([]);
  });
});

describe('duplicateSkillIssues', () => {
  const at = (folder: string, realFolder = folder) => ({
    filePath: `/repo/${folder}/deploy/SKILL.md`,
    realPath: `/repo/${realFolder}/deploy/SKILL.md`,
    name: 'deploy',
  });
  const describeCopy = (filePath: string) => filePath.replace('/repo/', '').replace('/deploy/SKILL.md', '');

  test('tells each copy where the other one is', () => {
    const issues = duplicateSkillIssues([at('.agents/skills'), at('.claude/skills')], describeCopy);
    expect(issues.get('/repo/.agents/skills/deploy/SKILL.md')).toBe('Same name as the skill in .claude/skills');
    expect(issues.get('/repo/.claude/skills/deploy/SKILL.md')).toBe('Same name as the skill in .agents/skills');
  });

  test('does not flag two paths to one file', () => {
    expect(duplicateSkillIssues([at('.agents/skills'), at('.claude/skills', '.agents/skills')], describeCopy).size).toBe(0);
  });

  test('does not flag skills with different names', () => {
    const other = { filePath: '/repo/.agents/skills/build/SKILL.md', realPath: '/repo/.agents/skills/build/SKILL.md', name: 'build' };
    expect(duplicateSkillIssues([at('.agents/skills'), other], describeCopy).size).toBe(0);
  });
});
