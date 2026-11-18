import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { docIssues } from '../docHealth';
import { clearDocMetaCache, getDocMeta } from '../docMeta';
import { readFrontMatterFields } from '../frontMatterFields';
import {
  defaultSkillRoot, existingSkillRoots, skillFileContent, skillNamesIn, validateSkillDescription, validateSkillName,
  writeSkill,
} from '../newSkill';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-newskill-')));
  clearDocMetaCache();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('validateSkillName', () => {
  test('accepts lower-case words joined by single hyphens', () => {
    expect(validateSkillName('docker-cleanup')).toBeUndefined();
    expect(validateSkillName('v2-deploy')).toBeUndefined();
  });

  test('rejects an empty name, capitals, spaces and stray hyphens', () => {
    for (const name of ['', '  ', 'Docker', 'docker cleanup', '-docker', 'docker-', 'docker--cleanup', 'docker_cleanup']) {
      expect(validateSkillName(name)).toEqual(expect.any(String));
    }
  });

  test('rejects a name over 64 characters', () => {
    expect(validateSkillName('a'.repeat(64))).toBeUndefined();
    expect(validateSkillName('a'.repeat(65))).toContain('64');
  });

  test('rejects a name that is already taken', () => {
    expect(validateSkillName('deploy', ['deploy'])).toBe('A skill named "deploy" already exists here.');
  });
});

describe('validateSkillDescription', () => {
  test('requires some text, within the limit', () => {
    expect(validateSkillDescription('Ship it.')).toBeUndefined();
    expect(validateSkillDescription('  ')).toEqual(expect.any(String));
    expect(validateSkillDescription('x'.repeat(1025))).toContain('1,024');
  });
});

describe('skillFileContent', () => {
  test('writes the name and description as front matter, and a title', () => {
    expect(skillFileContent('docker-cleanup', 'Remove stopped containers.')).toBe(
      '---\nname: docker-cleanup\ndescription: Remove stopped containers.\n---\n\n# Docker Cleanup\n\nDescribe the steps to follow here.\n'
    );
  });

  test('quotes a description that plain YAML would misread', () => {
    const description = "Deploy: build, then ship. Don't use on Fridays #really";
    const fields = readFrontMatterFields(skillFileContent('deploy', description));
    expect(fields.description).toBe(description);
  });

  test('puts a description typed over several lines on one', () => {
    expect(readFrontMatterFields(skillFileContent('deploy', 'Build it.\nShip it.')).description).toBe('Build it. Ship it.');
  });
});

describe('existingSkillRoots', () => {
  test('lists the skills folders a workspace has, in the order tools are checked', () => {
    fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
    expect(existingSkillRoots(root)).toEqual(['.agents/skills', '.claude/skills']);
  });

  test('is empty for a workspace with none, where the default is used', () => {
    expect(existingSkillRoots(root)).toEqual([]);
    expect(defaultSkillRoot).toBe('.agents/skills');
  });
});

describe('writeSkill', () => {
  test('creates the folder and a SKILL.md with nothing for the health checks to flag', () => {
    const skillsDir = path.join(root, defaultSkillRoot);
    const file = writeSkill(skillsDir, 'docker-cleanup', 'Remove stopped containers.');
    expect(file).toBe(path.join(skillsDir, 'docker-cleanup', 'SKILL.md'));
    expect(getDocMeta(file)).toMatchObject({ type: 'skill', name: 'docker-cleanup', description: 'Remove stopped containers.' });
    expect(docIssues(file, getDocMeta(file))).toEqual([]);
    expect(skillNamesIn(skillsDir)).toEqual(['docker-cleanup']);
  });

  test('refuses to write over a skill that exists', () => {
    const skillsDir = path.join(root, defaultSkillRoot);
    writeSkill(skillsDir, 'deploy', 'Ship it.');
    expect(() => writeSkill(skillsDir, 'deploy', 'Other.')).toThrow('already exists');
  });
});
