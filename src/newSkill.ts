import * as fs from 'fs';
import * as path from 'path';
import { commands, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { maxSkillDescriptionLength } from './docHealth';
import { prettifyName, skillFileName, skillRoots } from './docTypes';
import { activeFilePath } from './webview/activeFile';

/**
 * The New Skill command: asks for a name and a description, then creates
 * `<skills folder>/<name>/SKILL.md` with its front matter filled in.
 */

// Used when a workspace has no skills folder yet
export const defaultSkillRoot = '.agents/skills';
// The longest name the Agent Skills format allows
export const maxSkillNameLength = 64;

const skillNamePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * validateSkillName checks a skill name against the Agent Skills format:
 * lower-case letters, digits and single hyphens, as it doubles as the folder
 * name.
 * @param taken names already used in the skills folder
 * @returns what is wrong with the name, or undefined when it is fine
 */
export function validateSkillName(name: string, taken: string[] = []): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Enter a name for the skill.';
  }
  if (trimmed.length > maxSkillNameLength) {
    return `A skill name can be at most ${maxSkillNameLength} characters.`;
  }
  if (!skillNamePattern.test(trimmed)) {
    return 'Use lower-case letters, digits and single hyphens, for example "docker-cleanup".';
  }
  if (taken.includes(trimmed)) {
    return `A skill named "${trimmed}" already exists here.`;
  }
  return undefined;
}

/** validateSkillDescription checks the text an agent reads to decide when to use the skill. */
export function validateSkillDescription(description: string): string | undefined {
  const trimmed = description.trim();
  if (!trimmed) {
    return 'Say what the skill does and when to use it. Agents choose skills by this text.';
  }
  if (trimmed.length > maxSkillDescriptionLength) {
    return `A description can be at most ${maxSkillDescriptionLength.toLocaleString('en-US')} characters.`;
  }
  return undefined;
}

/** yamlScalar writes text as a YAML value, quoting it when plain text would be misread. */
function yamlScalar(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, ' ');
  const plainIsSafe = /^[A-Za-z0-9]/.test(oneLine) && !/: |:$| #|[[\]{}]/.test(oneLine);
  return plainIsSafe ? oneLine : `'${oneLine.replace(/'/g, "''")}'`;
}

/** skillFileContent builds a new SKILL.md. */
export function skillFileContent(name: string, description: string): string {
  return [
    '---',
    `name: ${name.trim()}`,
    `description: ${yamlScalar(description)}`,
    '---',
    '',
    `# ${prettifyName(name.trim())}`,
    '',
    'Describe the steps to follow here.',
    '',
  ].join('\n');
}

/** existingSkillRoots lists the skills folders a workspace folder already has, as relative paths. */
export function existingSkillRoots(workspaceDir: string): string[] {
  return skillRoots.filter(root => {
    try {
      return fs.statSync(path.join(workspaceDir, root)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** skillNamesIn lists the skills already in a skills folder. */
export function skillNamesIn(skillsDir: string): string[] {
  try {
    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * writeSkill creates the skill's folder and SKILL.md.
 * @returns the new file's path
 * @throws when the skill's folder already exists
 */
export function writeSkill(skillsDir: string, name: string, description: string): string {
  const skillDir = path.join(skillsDir, name.trim());
  if (fs.existsSync(skillDir)) {
    throw new Error(`${skillDir} already exists`);
  }
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, skillFileName);
  fs.writeFileSync(filePath, skillFileContent(name, description), { encoding: 'utf8', flag: 'wx' });
  return filePath;
}

/** Picks the workspace folder the skill goes in: the open file's, or the user's choice. */
async function pickWorkspaceFolder(): Promise<WorkspaceFolder | undefined> {
  const folders = (workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
  if (folders.length <= 1) {
    return folders[0];
  }
  const openFile = activeFilePath();
  const current = openFile ? workspace.getWorkspaceFolder(Uri.file(openFile)) : undefined;
  if (current && folders.includes(current)) {
    return current;
  }
  const picked = await window.showQuickPick(
    folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Which workspace folder is the skill for?' }
  );
  return picked?.folder;
}

/**
 * runNewSkillCommand walks the user through creating a skill and opens it.
 * The skill goes in the skills folder the workspace already uses; when there
 * are several the user picks one, and when there is none it is created.
 */
export async function runNewSkillCommand(): Promise<void> {
  const folder = await pickWorkspaceFolder();
  if (!folder) {
    window.showErrorMessage('Open a folder first: a skill is created inside a workspace.');
    return;
  }
  const workspaceDir = folder.uri.fsPath;

  const roots = existingSkillRoots(workspaceDir);
  let root = roots[0] ?? defaultSkillRoot;
  if (roots.length > 1) {
    const picked = await window.showQuickPick(roots, { placeHolder: 'Which skills folder should the new skill go in?' });
    if (!picked) {
      return;
    }
    root = picked;
  }
  const skillsDir = path.join(workspaceDir, root);
  const taken = skillNamesIn(skillsDir);

  const name = await window.showInputBox({
    title: 'New Skill',
    prompt: `Name of the skill. It becomes the folder ${root}/<name>.`,
    placeHolder: 'docker-cleanup',
    validateInput: value => validateSkillName(value, taken),
  });
  if (name === undefined) {
    return;
  }
  const description = await window.showInputBox({
    title: 'New Skill',
    prompt: 'What the skill does and when to use it. Agents choose skills by this text.',
    placeHolder: 'Remove stopped containers and dangling images. Use when disk space runs low.',
    validateInput: validateSkillDescription,
  });
  if (description === undefined) {
    return;
  }

  const filePath = writeSkill(skillsDir, name, description);
  await commands.executeCommand('vscode.openWith', Uri.file(filePath), 'codebook-md');
}
