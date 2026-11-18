import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as config from '../config';
import { clearDocMetaCache } from '../docMeta';
import { FolderGroup, FolderGroupFolder } from '../folders';
import { clearRelatedDocsCache, createDynamicFolderGroupFromPath, isRelatedDocsCurrent } from '../relatedDocs';

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  getDynamicFolderGroupConfig: jest.fn(),
  getWorkspaceFolder: jest.fn(),
  getWorkspaceFolderFor: jest.fn(),
}));

const mockedConfig = config as jest.Mocked<typeof config>;

let root: string;

function write(relativePath: string, content = '# Doc\n'): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function settings(overrides: Partial<config.DynamicFolderGroupConfig> = {}): void {
  mockedConfig.getDynamicFolderGroupConfig.mockReturnValue({
    enabled: true,
    name: 'Related Docs',
    description: 'For the current file',
    subFolderInclusions: [],
    exclusions: ['node_modules', 'out', 'dist'],
    includeAgentDocs: true,
    placeRulesByScope: true,
    ...overrides,
  });
}

/** Builds the group for a file in the fixture, failing the test when there is none. */
function groupFor(relativeFile: string): FolderGroup {
  const group = createDynamicFolderGroupFromPath(path.join(root, relativeFile));
  if (!group) {
    throw new Error('expected a dynamic folder group');
  }
  return group;
}

/** Walks down folder names from the group, failing the test when one is missing. */
function folderAt(group: FolderGroup, ...names: string[]): FolderGroupFolder {
  let folders = group.folders;
  let found: FolderGroupFolder | undefined;
  for (const name of names) {
    found = folders.find(folder => folder.name === name);
    if (!found) {
      throw new Error(`no folder "${name}" among [${folders.map(f => f.name).join(', ')}]`);
    }
    folders = found.folders;
  }
  return found as FolderGroupFolder;
}

const fileNames = (folder: FolderGroupFolder) => folder.files.map(file => file.name);
const folderNames = (folder: FolderGroupFolder) => folder.folders.map(sub => sub.name);

beforeEach(() => {
  // realpath: the temp folder is itself behind a symlink on macOS
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-related-')));
  const repoName = path.basename(root);
  expect(repoName).not.toBe('');

  write('AGENTS.md', '# Agents\n');
  fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
  write('README.md');
  write('.github/copilot-instructions.md');
  write('.github/instructions/extractor.instructions.md', '---\napplyTo: "extractor/**"\n---\n# Extractor rules\n');
  write('.agents/skills/docker-cleanup/SKILL.md', '---\nname: docker-cleanup\ndescription: Remove stopped containers.\n---\n# Docker cleanup\n');
  write('.agents/skills/extractor-deploy/SKILL.md', '# Deploy\n');
  write('.agents/skills/extractor-deploy/references/checklist.md');
  write('.agents/references/architecture.md');
  write('.claude/commands/commit.md');
  write('.claude/rules/style.md');
  write('.claude/agents/reviewer.md', '---\nname: code-reviewer\n---\n');
  write('tooling/tooling.md');
  write('tooling/deep/nested/notes.md');
  write('node_modules/pkg/README.md');
  write('extractor/README.md');
  write('extractor/apiplayground/debug.md', '# Debug\n\n```bash\necho hi\n```\n');

  mockedConfig.getWorkspaceFolder.mockReturnValue(root);
  mockedConfig.getWorkspaceFolderFor.mockReturnValue(root);
  settings();
  clearRelatedDocsCache();
  clearDocMetaCache();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('createDynamicFolderGroupFromPath', () => {
  const openFile = 'extractor/apiplayground/debug.md';
  const rootFolder = (group: FolderGroup) => group.folders[group.folders.length - 1];

  describe('folders around the open file', () => {
    test('lists each folder up to the workspace root, nearest first', () => {
      const group = groupFor(openFile);
      expect(group.folders.map(folder => folder.name)).toEqual(['Apiplayground', 'Extractor', suggested(root)]);
    });

    test('carries the configured name and is marked dynamic', () => {
      const group = groupFor(openFile);
      expect(group.name).toBe('Related Docs');
      expect(group.isDynamic).toBe(true);
    });

    test('returns nothing when the group is turned off', () => {
      settings({ enabled: false });
      expect(createDynamicFolderGroupFromPath(path.join(root, openFile))).toBeUndefined();
    });

    test('returns nothing for an empty path', () => {
      expect(createDynamicFolderGroupFromPath('')).toBeUndefined();
    });

    test('returns nothing for a file outside the workspace', () => {
      mockedConfig.getWorkspaceFolderFor.mockReturnValue(path.join(root, 'extractor'));
      expect(createDynamicFolderGroupFromPath(path.join(root, 'tooling', 'tooling.md'))).toBeUndefined();
    });

    test('marks a markdown file with runnable code as a notebook', () => {
      const debug = folderAt(groupFor(openFile), 'Apiplayground').files[0];
      expect(debug.docType).toBe('notebook');
    });

    test('stores workspace-relative paths with forward slashes', () => {
      const debug = folderAt(groupFor(openFile), 'Apiplayground').files[0];
      expect(debug.path).toBe('extractor/apiplayground/debug.md');
    });
  });

  describe('skills', () => {
    test('are listed in a Skills folder under the folder that holds them', () => {
      const skills = folderAt(groupFor(openFile), suggested(root), 'Skills');
      expect(fileNames(skills)).toEqual(['Docker Cleanup']);
      expect(folderNames(skills)).toEqual(['Extractor Deploy']);
    });

    test('are named from front matter, with the exact name in the hover text', () => {
      const skill = folderAt(groupFor(openFile), suggested(root), 'Skills').files[0];
      expect(skill.docType).toBe('skill');
      expect(skill.tooltip).toBe('Skill: docker-cleanup\nRemove stopped containers.\n.agents/skills/docker-cleanup/SKILL.md');
    });

    test('take their folder name when the front matter has no name', () => {
      const skill = folderAt(groupFor(openFile), suggested(root), 'Skills', 'Extractor Deploy');
      expect(skill.filePath).toBe('.agents/skills/extractor-deploy/SKILL.md');
    });

    test('become a folder that lists their other markdown files', () => {
      const skill = folderAt(groupFor(openFile), suggested(root), 'Skills', 'Extractor Deploy');
      expect(skill.docType).toBe('skill');
      expect(fileNames(skill)).toEqual(['Checklist']);
    });

    test('list their scripts and other files by path, after the markdown', () => {
      write('.agents/skills/extractor-deploy/scripts/deploy.sh', '#!/bin/sh\n');
      write('.agents/skills/extractor-deploy/template.json', '{}\n');
      const skill = folderAt(groupFor(openFile), suggested(root), 'Skills', 'Extractor Deploy');
      expect(fileNames(skill)).toEqual(['Checklist', 'template.json', 'scripts/deploy.sh']);
      expect(skill.files[2]).toMatchObject({
        path: '.agents/skills/extractor-deploy/scripts/deploy.sh',
        tooltip: '.agents/skills/extractor-deploy/scripts/deploy.sh',
      });
      expect(skill.files[2].docType).toBeUndefined();
    });

    test('become a folder when a script is their only other file', () => {
      write('.agents/skills/docker-cleanup/clean.sh', '#!/bin/sh\n');
      const skills = folderAt(groupFor(openFile), suggested(root), 'Skills');
      expect(fileNames(skills)).toEqual([]);
      expect(fileNames(folderAt(groupFor(openFile), suggested(root), 'Skills', 'Docker Cleanup'))).toEqual(['clean.sh']);
    });

    test('leave out hidden files', () => {
      write('.agents/skills/docker-cleanup/.DS_Store', '');
      expect(fileNames(folderAt(groupFor(openFile), suggested(root), 'Skills'))).toEqual(['Docker Cleanup']);
    });

    test('are left out when agent docs are turned off', () => {
      settings({ includeAgentDocs: false });
      expect(folderNames(rootFolder(groupFor(openFile)))).not.toContain('Skills');
    });

    test('appear once when a second skills folder links to the first', () => {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.symlinkSync(path.join('..', '.agents', 'skills'), path.join(root, '.claude', 'skills'));
      const skills = folderAt(groupFor(openFile), suggested(root), 'Skills');
      expect(fileNames(skills)).toEqual(['Docker Cleanup']);
      expect(skills.files[0].tooltip).toContain('Also at: .claude/skills/docker-cleanup/SKILL.md');
    });
  });

  describe('other agent docs', () => {
    test('group rules, prompts, agent definitions and references by type', () => {
      const names = folderNames(rootFolder(groupFor(openFile)));
      expect(names).toEqual(['Skills', 'Rules', 'Prompts', 'Agent Definitions', 'Agent References']);
    });

    test('list a rule with no scope under Rules', () => {
      const rules = folderAt(groupFor(openFile), suggested(root), 'Rules');
      expect(rules.files.map(file => [file.name, file.docType])).toEqual([['Style', 'rule']]);
      expect(rules.files[0].scope).toBeUndefined();
    });

    test('name an agent definition from its front matter', () => {
      const agents = folderAt(groupFor(openFile), suggested(root), 'Agent Definitions');
      expect(fileNames(agents)).toEqual(['Code Reviewer']);
    });

    test('list markdown under .agents that nothing else claims as references', () => {
      const references = folderAt(groupFor(openFile), suggested(root), 'Agent References');
      expect(fileNames(references)).toEqual(['Architecture']);
    });

    test('put single instruction files next to the folder\'s own markdown', () => {
      expect(fileNames(rootFolder(groupFor(openFile)))).toContain('Copilot Instructions');
    });

    test('are not repeated when an inclusion already shows them', () => {
      settings({ subFolderInclusions: ['.github', 'instructions'], placeRulesByScope: false });
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, suggested(root), 'Github', 'Instructions'))).toEqual(['Extractor Instructions']);
      expect(fileNames(folderAt(group, suggested(root), 'Rules'))).toEqual(['Style']);
      expect(fileNames(rootFolder(group))).not.toContain('Copilot Instructions');
    });
  });

  describe('scoped rules', () => {
    const rule = (applyTo: string) => `---\napplyTo: "${applyTo}"\n---\n# Rule\n`;
    const rulesAtRoot = (group: FolderGroup) => fileNames(folderAt(group, suggested(root), 'Rules'));

    test('move to the folder they apply to', () => {
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, 'Extractor'))).toEqual(['Readme', 'Extractor Instructions']);
      expect(rulesAtRoot(group)).toEqual(['Style']);
    });

    test('carry their patterns, the folder those are relative to, and both in the hover text', () => {
      const moved = folderAt(groupFor(openFile), 'Extractor').files[1];
      expect(moved).toMatchObject({
        path: '.github/instructions/extractor.instructions.md',
        docType: 'rule',
        scope: ['extractor/**'],
        scopeBase: '',
      });
      expect(moved.tooltip).toBe('Rule\nApplies to: extractor/**\n50 bytes, about 13 tokens\n.github/instructions/extractor.instructions.md');
    });

    test('stay where the file is kept when the setting is off', () => {
      settings({ placeRulesByScope: false });
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, 'Extractor'))).toEqual(['Readme']);
      expect(rulesAtRoot(group)).toEqual(['Extractor Instructions', 'Style']);
      // The scope is still read, for the chip and the mark
      expect(folderAt(group, suggested(root), 'Rules').files[0].scope).toEqual(['extractor/**']);
    });

    test('stay where the file is kept when their folder is not one of those shown', () => {
      write('.github/instructions/parser.instructions.md', rule('parser/**'));
      expect(rulesAtRoot(groupFor(openFile))).toEqual(['Parser Instructions', 'Style']);
    });

    test('stay where the file is kept when they cover their whole base folder', () => {
      write('.github/instructions/go.instructions.md', rule('**/*.go'));
      expect(rulesAtRoot(groupFor(openFile))).toEqual(['Go Instructions', 'Style']);
    });

    test('appear under each folder they name', () => {
      write('.github/instructions/both.instructions.md', rule('parser/**,extractor/apiplayground/**, extractor/*.go'));
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, 'Apiplayground'))).toContain('Both Instructions');
      expect(fileNames(folderAt(group, 'Extractor'))).toContain('Both Instructions');
      expect(rulesAtRoot(group)).toEqual(['Style']);
    });

    test('read a brace group as several folders', () => {
      write('.github/instructions/pair.instructions.md', rule('{parser,extractor}/**'));
      expect(fileNames(folderAt(groupFor(openFile), 'Extractor'))).toContain('Pair Instructions');
    });

    test('read a list of paths from a Claude Code rule', () => {
      write('.claude/rules/playground.md', '---\npaths:\n  - extractor/apiplayground/**\n---\n');
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, 'Apiplayground'))).toContain('Playground');
      expect(rulesAtRoot(group)).toEqual(['Style']);
    });

    test('read patterns relative to the folder that holds the rule folder', () => {
      write('extractor/.claude/rules/local.md', '---\npaths: apiplayground/**\n---\n');
      const local = folderAt(groupFor(openFile), 'Apiplayground').files.find(file => file.name === 'Local');
      expect(local).toMatchObject({ scope: ['apiplayground/**'], scopeBase: 'extractor' });
    });

    test('move out of a folder shown by an inclusion as well', () => {
      settings({ subFolderInclusions: ['.github', 'instructions'] });
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, 'Extractor'))).toContain('Extractor Instructions');
      expect(folderNames(folderAt(group, suggested(root), 'Github'))).toEqual([]);
    });
  });

  describe('problems', () => {
    test('are listed on the row of a doc that has them, and in its hover text', () => {
      const deploy = folderAt(groupFor(openFile), suggested(root), 'Skills', 'Extractor Deploy');
      expect(deploy.issues).toEqual(['No name in the front matter', 'No description in the front matter']);
      expect(deploy.tooltip).toContain('Problem: No name in the front matter');
    });

    test('are absent from a doc with nothing wrong', () => {
      const cleanup = folderAt(groupFor(openFile), suggested(root), 'Skills').files[0];
      expect(cleanup.issues).toBeUndefined();
    });

    test('flag a skill copied into a second skills folder, on both copies', () => {
      write('.claude/skills/docker-cleanup/SKILL.md', '---\nname: docker-cleanup\ndescription: An older copy.\n---\n');
      const skills = folderAt(groupFor(openFile), suggested(root), 'Skills');
      expect(skills.files.map(file => [file.path, file.issues])).toEqual([
        ['.agents/skills/docker-cleanup/SKILL.md', ['Same name as the skill in .claude/skills']],
        ['.claude/skills/docker-cleanup/SKILL.md', ['Same name as the skill in .agents/skills']],
      ]);
    });
  });

  describe('symlinked files', () => {
    test('show once, under the real file, with the link named beside it', () => {
      const files = rootFolder(groupFor(openFile)).files;
      const agents = files.filter(file => file.docType === 'instructions' && file.path === 'AGENTS.md');
      expect(agents).toHaveLength(1);
      expect(agents[0].hint).toBe('also CLAUDE.md');
      expect(files.map(file => file.path)).not.toContain('CLAUDE.md');
    });
  });

  describe('subFolderInclusions', () => {
    test('a plain name adds that folder but not the folders below it', () => {
      settings({ subFolderInclusions: ['tooling'] });
      const tooling = folderAt(groupFor(openFile), suggested(root), 'Tooling');
      expect(fileNames(tooling)).toEqual(['Tooling']);
      expect(tooling.folders).toEqual([]);
    });

    test('a pattern ending in /** adds the folder and everything below it', () => {
      settings({ subFolderInclusions: ['tooling/**'] });
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, suggested(root), 'Tooling'))).toEqual(['Tooling']);
      expect(fileNames(folderAt(group, suggested(root), 'Tooling', 'Deep', 'Nested'))).toEqual(['Notes']);
    });

    test('a path without wildcards adds exactly that folder', () => {
      settings({ subFolderInclusions: ['tooling/deep/nested'] });
      const group = groupFor(openFile);
      expect(fileNames(folderAt(group, suggested(root), 'Tooling', 'Deep', 'Nested'))).toEqual(['Notes']);
      expect(fileNames(folderAt(group, suggested(root), 'Tooling'))).toEqual([]);
    });

    test('never walks node_modules, even when it is listed', () => {
      settings({ subFolderInclusions: ['node_modules', '**/pkg'], exclusions: [] });
      expect(folderNames(rootFolder(groupFor(openFile)))).not.toContain('Node Modules');
    });

    test('leaves out excluded names', () => {
      settings({ subFolderInclusions: ['tooling/**'], exclusions: ['deep'] });
      expect(folderAt(groupFor(openFile), suggested(root), 'Tooling').folders).toEqual([]);
    });
  });

  describe('caching', () => {
    test('reuses the result while the folders are unchanged', () => {
      expect(groupFor(openFile)).toBe(groupFor(openFile));
    });

    test('rescans when a scanned folder changes', () => {
      const before = groupFor(openFile);
      write('.agents/skills/new-skill/SKILL.md');
      // Make the change visible on file systems with coarse timestamps
      const later = new Date(Date.now() + 5000);
      fs.utimesSync(path.join(root, '.agents', 'skills'), later, later);

      const after = groupFor(openFile);
      expect(after).not.toBe(before);
      expect(fileNames(folderAt(after, suggested(root), 'Skills'))).toEqual(['Docker Cleanup', 'New Skill']);
    });

    test('rescans when a location that did not exist is created', () => {
      const before = groupFor(openFile);
      write('.kiro/steering/product.md');
      expect(groupFor(openFile)).not.toBe(before);
    });

    test('rescans after the cache is cleared', () => {
      const before = groupFor(openFile);
      clearRelatedDocsCache();
      expect(groupFor(openFile)).not.toBe(before);
    });
  });
});

describe('isRelatedDocsCurrent', () => {
  const openPath = () => path.join(root, 'extractor', 'apiplayground', 'debug.md');

  test('is false before the group has been built', () => {
    expect(isRelatedDocsCurrent(openPath())).toBe(false);
  });

  test('is true while the folders the group was built from are unchanged', () => {
    createDynamicFolderGroupFromPath(openPath());
    expect(isRelatedDocsCurrent(openPath())).toBe(true);
  });

  test('is false after a skill folder is deleted', () => {
    createDynamicFolderGroupFromPath(openPath());
    fs.rmSync(path.join(root, '.agents', 'skills', 'docker-cleanup'), { recursive: true });
    // Make the change visible on file systems with coarse timestamps
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, '.agents', 'skills'), later, later);
    expect(isRelatedDocsCurrent(openPath())).toBe(false);
  });

  test('is false after a file is added to a skill', () => {
    createDynamicFolderGroupFromPath(openPath());
    write('.agents/skills/docker-cleanup/clean.sh', '#!/bin/sh\n');
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, '.agents', 'skills', 'docker-cleanup'), later, later);
    expect(isRelatedDocsCurrent(openPath())).toBe(false);
  });

  test('is true when the group is turned off, as there is nothing to redraw', () => {
    settings({ enabled: false });
    expect(isRelatedDocsCurrent(openPath())).toBe(true);
  });
});

/** The display name the group gives the fixture's root folder. */
function suggested(dirPath: string): string {
  return jest.requireActual<typeof import('../folders')>('../folders').suggestedDisplayName(path.basename(dirPath));
}
