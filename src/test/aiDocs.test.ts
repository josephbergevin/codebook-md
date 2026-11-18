import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AiDocGroup, AiDocRow, AiDocsRoot, countAiDocs, rowAppliesTo, scanAiDocs } from '../aiDocs';
import { clearDocMetaCache } from '../docMeta';

let root: string;
let home: string;

function writeIn(base: string, relativePath: string, content = '# Doc\n'): void {
  const target = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
const write = (relativePath: string, content?: string) => writeIn(root, relativePath, content);

async function scan(exclusions: string[] = ['node_modules']): Promise<AiDocsRoot> {
  return (await scanAiDocs([{ name: 'repo', dirPath: root }], { exclusions }))[0];
}

function group(result: AiDocsRoot, key: string): AiDocGroup {
  const found = result.groups.find(candidate => candidate.key === key);
  if (!found) {
    throw new Error(`no group "${key}" among [${result.groups.map(g => g.key).join(', ')}]`);
  }
  return found;
}

function row(result: AiDocsRoot, key: string, displayPath: string): AiDocRow {
  const found = group(result, key).rows.find(candidate => candidate.displayPath === displayPath);
  if (!found) {
    throw new Error(`no row "${displayPath}" in ${key}: [${group(result, key).rows.map(r => r.displayPath).join(', ')}]`);
  }
  return found;
}

const skill = (name: string, description = 'Does it.') => `---\nname: ${name}\ndescription: ${description}\n---\n`;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-aidocs-')));
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-home-')));

  write('AGENTS.md');
  fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
  write('README.md');
  write('src/AGENTS.md');
  write('src/webview/AGENTS.md');
  write('src/webview/view.ts', '');
  write('.github/copilot-instructions.md');
  write('.github/instructions/web.instructions.md', '---\napplyTo: "src/webview/**"\n---\n');
  write('.claude/rules/style.md');
  write('.agents/skills/docker-cleanup/SKILL.md', skill('docker-cleanup', 'Remove stopped containers.'));
  write('.agents/skills/release/SKILL.md', skill('release'));
  write('.claude/commands/commit.md');
  write('.claude/agents/reviewer.md', '---\nname: code-reviewer\n---\n');
  write('.agents/references/architecture.md');
  write('packages/api/.claude/skills/api-deploy/SKILL.md', skill('api-deploy'));
  write('node_modules/pkg/AGENTS.md');
  write('docs/guide.md');

  clearDocMetaCache();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe('scanAiDocs', () => {
  test('groups the docs by type, in a fixed order', async () => {
    expect((await scan()).groups.map(g => [g.key, g.title, g.rows.length])).toEqual([
      ['instructions', 'Instructions', 4],
      ['rule', 'Rules', 2],
      ['skill', 'Skills', 3],
      ['prompt', 'Prompts', 1],
      ['agent', 'Agent Definitions', 1],
      ['reference', 'Agent References', 1],
    ]);
  });

  test('finds instruction files at any depth, the workspace\'s own first', async () => {
    expect(group(await scan(), 'instructions').rows.map(r => [r.displayPath, r.name, r.hint])).toEqual([
      ['AGENTS.md', 'Agents', 'workspace root'],
      ['.github/copilot-instructions.md', 'Copilot Instructions', 'workspace root'],
      ['src/AGENTS.md', 'Agents', 'src'],
      ['src/webview/AGENTS.md', 'Agents', 'src/webview'],
    ]);
  });

  test('lists a symlinked file once, under its real path', async () => {
    const agents = row(await scan(), 'instructions', 'AGENTS.md');
    expect(agents.tooltip).toContain('Also at: CLAUDE.md');
  });

  test('never looks in node_modules, and skips excluded folders', async () => {
    const paths = (result: AiDocsRoot) => result.groups.flatMap(g => g.rows.map(r => r.displayPath));
    expect(paths(await scan()).some(p => p.startsWith('node_modules/'))).toBe(false);
    expect(paths(await scan(['node_modules', 'src'])).some(p => p.startsWith('src/'))).toBe(false);
  });

  test('names skills from front matter and carries their description', async () => {
    expect(row(await scan(), 'skill', '.agents/skills/docker-cleanup/SKILL.md')).toMatchObject({
      name: 'Docker Cleanup',
      docType: 'skill',
      description: 'Remove stopped containers.',
      issues: [],
    });
  });

  test('says which nested project a doc belongs to', async () => {
    expect(row(await scan(), 'skill', 'packages/api/.claude/skills/api-deploy/SKILL.md').hint).toBe('packages/api');
    expect(row(await scan(), 'skill', '.agents/skills/release/SKILL.md').hint).toBeUndefined();
  });

  test('shows both copies of a skill and says on each where the other is', async () => {
    write('.claude/skills/release/SKILL.md', skill('release', 'An older copy.'));
    const result = await scan();
    expect(row(result, 'skill', '.agents/skills/release/SKILL.md')).toMatchObject({
      hint: '.agents/skills',
      issues: ['Same name as the skill in .claude/skills'],
    });
    expect(row(result, 'skill', '.claude/skills/release/SKILL.md')).toMatchObject({
      hint: '.claude/skills',
      issues: ['Same name as the skill in .agents/skills'],
    });
  });

  test('lists a skills folder that is a link to another one once', async () => {
    fs.symlinkSync(path.join('..', '.agents', 'skills'), path.join(root, '.claude', 'skills'));
    const skills = group(await scan(), 'skill').rows.filter(r => r.name === 'Release');
    expect(skills.map(r => [r.displayPath, r.issues])).toEqual([['.agents/skills/release/SKILL.md', []]]);
  });

  test('reads a rule\'s scope, and the folder an unscoped rule covers', async () => {
    const result = await scan();
    expect(row(result, 'rule', '.github/instructions/web.instructions.md')).toMatchObject({
      scope: ['src/webview/**'],
      scopeBase: root,
    });
    const style = row(result, 'rule', '.claude/rules/style.md');
    expect(style.scope).toBeUndefined();
    expect(style.appliesUnder).toBe(root);
  });

  test('reports problems found by the health checks', async () => {
    write('.agents/skills/broken/SKILL.md', '# Broken\n');
    expect(row(await scan(), 'skill', '.agents/skills/broken/SKILL.md').issues).toEqual([
      'No name in the front matter',
      'No description in the front matter',
    ]);
  });

  test('puts the size of an instruction file in its hover text', async () => {
    write('src/AGENTS.md', 'x'.repeat(6332));
    expect(row(await scan(), 'instructions', 'src/AGENTS.md').tooltip).toContain('6.3 KB, about 1,600 tokens');
  });

  test('lists other markdown in the tools\' folders as references', async () => {
    expect(group(await scan(), 'reference').rows.map(r => r.displayPath)).toEqual(['.agents/references/architecture.md']);
  });

  test('returns a root with no groups for a folder with no agent docs', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-empty-'));
    try {
      fs.writeFileSync(path.join(empty, 'README.md'), '# Hi\n');
      const [result] = await scanAiDocs([{ name: 'empty', dirPath: empty }], { exclusions: [] });
      expect(result.groups).toEqual([]);
      expect(countAiDocs([result])).toBe(0);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test('counts the docs across roots', async () => {
    expect(countAiDocs([await scan()])).toBe(12);
  });
});

describe('scanAiDocs for user-level docs', () => {
  const scanHome = async () => (await scanAiDocs([{ name: 'User', dirPath: home, isUser: true }], { exclusions: [] }))[0];

  beforeEach(() => {
    writeIn(home, '.claude/CLAUDE.md');
    writeIn(home, '.claude/skills/tidy/SKILL.md', skill('tidy'));
    writeIn(home, '.claude/rules/tone.md');
    writeIn(home, '.claude/notes/scratch.md');
    writeIn(home, '.codex/AGENTS.md');
    writeIn(home, 'projects/other/AGENTS.md');
    writeIn(home, 'projects/other/.claude/skills/private/SKILL.md', skill('private'));
  });

  test('reads only the tools\' own folders, never the rest of the home folder', async () => {
    const paths = (await scanHome()).groups.flatMap(g => g.rows.map(r => r.displayPath));
    expect(paths.sort()).toEqual([
      '~/.claude/CLAUDE.md',
      '~/.claude/rules/tone.md',
      '~/.claude/skills/tidy/SKILL.md',
      '~/.codex/AGENTS.md',
    ]);
  });

  test('marks instruction files and unscoped rules as applying everywhere', async () => {
    const result = await scanHome();
    expect(row(result, 'instructions', '~/.claude/CLAUDE.md')).toMatchObject({ appliesEverywhere: true, hint: '~' });
    expect(row(result, 'instructions', '~/.codex/AGENTS.md').hint).toBe('~/.codex');
    expect(row(result, 'rule', '~/.claude/rules/tone.md').appliesEverywhere).toBe(true);
    expect(row(result, 'skill', '~/.claude/skills/tidy/SKILL.md').appliesEverywhere).toBeUndefined();
  });
});

describe('rowAppliesTo', () => {
  const file = (...parts: string[]) => path.join(root, ...parts);

  test('an instruction file applies to files in its folder and below', async () => {
    const result = await scan();
    const applying = (openFile: string) => group(result, 'instructions').rows
      .filter(r => rowAppliesTo(r, openFile))
      .map(r => r.displayPath);
    expect(applying(file('src', 'webview', 'view.ts'))).toEqual([
      'AGENTS.md', '.github/copilot-instructions.md', 'src/AGENTS.md', 'src/webview/AGENTS.md',
    ]);
    expect(applying(file('src', 'config.ts'))).toEqual(['AGENTS.md', '.github/copilot-instructions.md', 'src/AGENTS.md']);
    expect(applying(file('docs', 'guide.md'))).toEqual(['AGENTS.md', '.github/copilot-instructions.md']);
  });

  test('a scoped rule applies only to files its pattern matches', async () => {
    const web = row(await scan(), 'rule', '.github/instructions/web.instructions.md');
    expect(rowAppliesTo(web, file('src', 'webview', 'view.ts'))).toBe(true);
    expect(rowAppliesTo(web, file('src', 'config.ts'))).toBe(false);
  });

  test('an unscoped rule applies to every file in its project', async () => {
    const style = row(await scan(), 'rule', '.claude/rules/style.md');
    expect(rowAppliesTo(style, file('docs', 'guide.md'))).toBe(true);
    expect(rowAppliesTo(style, path.join(home, 'elsewhere.md'))).toBe(false);
  });

  test('skills, prompts and agent definitions are never marked: they load when asked for', async () => {
    const result = await scan();
    for (const key of ['skill', 'prompt', 'agent', 'reference']) {
      expect(group(result, key).rows.some(r => rowAppliesTo(r, file('src', 'webview', 'view.ts')))).toBe(false);
    }
  });

  test('nothing applies when no file is open', async () => {
    expect(rowAppliesTo(row(await scan(), 'instructions', 'AGENTS.md'), undefined)).toBe(false);
  });
});
