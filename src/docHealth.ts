import * as fs from 'fs';
import * as path from 'path';
import { alwaysSkippedDirs } from './dirEntries';
import { DocMeta } from './docMeta';
import { ruleBaseDir, readScopePatterns } from './docScope';
import { docTypeInfo, skillFileName } from './docTypes';
import { globLiteralPrefix, matchesGlob, toPosix } from './glob';

/**
 * Health checks for agent docs: problems that make a doc easy for an agent to
 * misread or never find. Each check returns a short sentence for the row's
 * warning mark and hover text. Nothing here blocks anything.
 */

// The longest description the Agent Skills format allows
export const maxSkillDescriptionLength = 1024;
// The most broken links named for one doc before the rest are counted
const maxLinksNamed = 3;
// How far a scope pattern is searched for a matching file before giving up
const maxScopeEntries = 3000;
const maxScopeDepth = 10;

function isSkillFile(filePath: string): boolean {
  return path.basename(filePath).toLowerCase() === skillFileName.toLowerCase();
}

/** skillIssues checks the front matter an agent reads to choose a skill. */
function skillIssues(filePath: string, meta: DocMeta): string[] {
  const issues: string[] = [];
  const folder = path.basename(path.dirname(filePath));
  if (!meta.name) {
    issues.push('No name in the front matter');
  } else if (meta.name !== folder) {
    issues.push(`Name "${meta.name}" differs from its folder "${folder}"`);
  }
  if (!meta.description) {
    issues.push('No description in the front matter');
  } else if (meta.description.length > maxSkillDescriptionLength) {
    const length = meta.description.length.toLocaleString('en-US');
    const limit = maxSkillDescriptionLength.toLocaleString('en-US');
    issues.push(`Description is ${length} characters; the limit is ${limit}`);
  }
  return issues;
}

/** linkIssues names the relative links that point at files that do not exist. */
function linkIssues(filePath: string, meta: DocMeta): string[] {
  const dir = path.dirname(filePath);
  const broken = (meta.links ?? []).filter(target => !fs.existsSync(path.resolve(dir, target)));
  const issues = broken.slice(0, maxLinksNamed).map(target => `Links to a file that does not exist: ${target}`);
  if (broken.length > maxLinksNamed) {
    const more = broken.length - maxLinksNamed;
    issues.push(`${more} more ${more === 1 ? 'link points' : 'links point'} at files that do not exist`);
  }
  return issues;
}

/**
 * scopeHasMatch searches the base folder for a file the pattern matches.
 * @returns true or false when the search finished, undefined when it gave up
 */
function scopeHasMatch(baseDir: string, pattern: string): boolean | undefined {
  let seen = 0;
  let gaveUp = false;

  const search = (dirPath: string, depth: number): boolean => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (++seen > maxScopeEntries) {
        gaveUp = true;
        return false;
      }
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (alwaysSkippedDirs.has(entry.name)) {
          continue;
        }
        if (depth >= maxScopeDepth) {
          gaveUp = true;
          continue;
        }
        if (search(entryPath, depth + 1)) {
          return true;
        }
      } else if (matchesGlob(toPosix(path.relative(baseDir, entryPath)), pattern)) {
        return true;
      }
    }
    return false;
  };

  const found = search(path.join(baseDir, globLiteralPrefix(pattern)), 0);
  return found ? true : (gaveUp ? undefined : false);
}

/** scopeIssues flags scope patterns that no longer lead anywhere. */
function scopeIssues(filePath: string, meta: DocMeta): string[] {
  const patterns = readScopePatterns(meta.fields);
  const baseDir = patterns.length ? ruleBaseDir(filePath) : undefined;
  if (!baseDir) {
    return [];
  }
  const issues: string[] = [];
  for (const pattern of patterns) {
    const prefix = globLiteralPrefix(pattern);
    const hasWildcard = prefix !== toPosix(pattern);
    if (!hasWildcard) {
      // The pattern names one file or folder outright
      if (!fs.existsSync(path.join(baseDir, pattern))) {
        issues.push(`Scope "${pattern}" names a path that does not exist`);
      }
    } else if (prefix && !fs.existsSync(path.join(baseDir, prefix))) {
      issues.push(`Scope "${pattern}" names a folder that does not exist: ${prefix}`);
    } else if (scopeHasMatch(baseDir, pattern) === false) {
      issues.push(`Scope "${pattern}" matches no files`);
    }
  }
  return issues;
}

/**
 * docIssues lists the problems found in one agent doc. A file that is not an
 * agent doc has none: your own notes are not held to these rules.
 * @param filePath the doc's absolute path
 * @param meta its metadata, from getDocMeta
 */
export function docIssues(filePath: string, meta: DocMeta): string[] {
  if (!docTypeInfo(meta.type).isAgentDoc) {
    return [];
  }
  const issues: string[] = [];
  if (meta.unclosedFrontMatter) {
    // Nothing else in the front matter can be read, so say this alone
    issues.push('Front matter never closes: the second --- is missing');
  } else {
    if (isSkillFile(filePath)) {
      issues.push(...skillIssues(filePath, meta));
    }
    if (meta.type === 'rule') {
      issues.push(...scopeIssues(filePath, meta));
    }
  }
  issues.push(...linkIssues(filePath, meta));
  return issues;
}

/** One skill, as far as telling copies apart goes. */
export interface SkillIdentity {
  // The path the skill is listed under
  filePath: string;
  // The path with symlinks resolved; two paths to one file are not copies
  realPath: string;
  // The front matter name, or the folder name when there is none
  name: string;
}

/**
 * duplicateSkillIssues finds skills that share a name but are separate files,
 * such as a copy in `.claude/skills` that has drifted from `.agents/skills`.
 * @param describe turns the other copy's path into the text shown to the user
 * @returns an issue for each copy, keyed by its filePath
 */
export function duplicateSkillIssues(skills: SkillIdentity[], describe: (filePath: string) => string): Map<string, string> {
  const byName = new Map<string, SkillIdentity[]>();
  for (const skill of skills) {
    const list = byName.get(skill.name) ?? [];
    if (!list.some(other => other.realPath === skill.realPath)) {
      list.push(skill);
    }
    byName.set(skill.name, list);
  }

  const issues = new Map<string, string>();
  for (const copies of byName.values()) {
    if (copies.length < 2) {
      continue;
    }
    for (const copy of copies) {
      const others = copies.filter(other => other !== copy).map(other => describe(other.filePath));
      issues.set(copy.filePath, `Same name as the skill in ${others.join(' and ')}`);
    }
  }
  return issues;
}
