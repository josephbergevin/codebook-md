import * as path from 'path';
import { agentDocLocations } from './docTypes';
import { FrontMatterValue } from './frontMatterFields';
import { globLiteralPrefix, matchesGlob, toPosix } from './glob';

/**
 * The scope of an agent rule: which files it applies to.
 *
 * Rule files say so in their front matter, each tool under its own key. The
 * values are glob patterns, read relative to the folder that holds the tool's
 * rule folder: for `repo/.github/instructions/go.instructions.md`, patterns
 * are relative to `repo`.
 *
 * This module only works on strings and paths. It never reads the disk.
 */

/** Front matter keys that hold scope patterns, with the tool that reads each. */
export const scopeKeys: string[] = [
  'applyTo', // GitHub Copilot instruction files
  'paths', // Claude Code rules
  'globs', // Cursor, Continue and Windsurf rules
  'fileMatchPattern', // Kiro steering files
];

const wildcardChars = /[*?[\]{}]/;
// The most patterns one brace group may expand to
const maxExpansions = 16;

/** splitTopLevel splits text on a separator, ignoring separators inside braces or brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '{' || ch === '[') {
      depth++;
    } else if ((ch === '}' || ch === ']') && depth > 0) {
      depth--;
    }
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function cleanPattern(pattern: string): string {
  // Patterns are relative to the base folder, however they are written
  return toPosix(pattern.trim()).replace(/^\/+/, '');
}

/**
 * readScopePatterns collects a rule's scope patterns from its front matter.
 *
 * A value may be a list or one string holding several patterns separated by
 * commas, as in `applyTo: "parser/**,extractor/**"`. Commas inside braces stay
 * part of their pattern.
 * @returns the patterns in the order written, without duplicates
 */
export function readScopePatterns(fields: Record<string, FrontMatterValue>): string[] {
  const patterns: string[] = [];
  for (const key of scopeKeys) {
    const value = fields[key];
    if (value === undefined) {
      continue;
    }
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      for (const part of splitTopLevel(entry, ',')) {
        const pattern = cleanPattern(part);
        if (pattern && !patterns.includes(pattern)) {
          patterns.push(pattern);
        }
      }
    }
  }
  return patterns;
}

/** expandBraces turns `{a,b}/**` into `a/**` and `b/**`, up to a limit. */
function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf('{');
  if (open === -1) {
    return [pattern];
  }
  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === '{') {
      depth++;
    } else if (pattern[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    return [pattern];
  }
  const choices = splitTopLevel(pattern.slice(open + 1, close), ',');
  if (choices.length < 2) {
    return [pattern];
  }
  const expanded: string[] = [];
  for (const choice of choices) {
    for (const result of expandBraces(pattern.slice(0, open) + choice + pattern.slice(close + 1))) {
      if (expanded.length >= maxExpansions) {
        return expanded;
      }
      expanded.push(result);
    }
  }
  return expanded;
}

/**
 * scopeFolder turns one pattern into the folder it is about: the path before
 * its first wildcard. `extractor/**` + `/*.go` gives `extractor`, and a pattern
 * with no fixed start, such as `**` + `/*.ts`, gives an empty string, which
 * stands for the base folder. A pattern that names one file gives the folder
 * that file is in.
 */
export function scopeFolder(pattern: string): string {
  const cleaned = cleanPattern(pattern);
  if (wildcardChars.test(cleaned)) {
    return globLiteralPrefix(cleaned);
  }
  // No wildcard: the pattern is a folder, or a file if its last part has an extension
  const lastSlash = cleaned.lastIndexOf('/');
  const lastSegment = cleaned.slice(lastSlash + 1);
  const namesFile = /[^.]\.[^.]+$/.test(lastSegment);
  if (!namesFile) {
    return cleaned;
  }
  return lastSlash === -1 ? '' : cleaned.slice(0, lastSlash);
}

/**
 * scopeFolders lists the folders a rule's patterns are about, relative to the
 * base folder, without duplicates. Brace groups are expanded first, so
 * `{parser,extractor}/**` is about two folders.
 */
export function scopeFolders(patterns: string[]): string[] {
  const folders: string[] = [];
  for (const pattern of patterns) {
    for (const expanded of expandBraces(cleanPattern(pattern))) {
      const folder = scopeFolder(expanded);
      if (!folders.includes(folder)) {
        folders.push(folder);
      }
    }
  }
  return folders;
}

const ruleLocations: string[] = agentDocLocations
  .filter(location => location.type === 'rule' && !location.file)
  .map(location => location.path.toLowerCase());

/**
 * ruleBaseDir returns the folder a rule file's patterns are relative to: the
 * one that holds its rule folder. For `repo/.claude/rules/api/go.md` that is
 * `repo`.
 * @returns undefined when the file is not inside a known rule folder
 */
export function ruleBaseDir(filePath: string): string | undefined {
  const posix = filePath.replace(/\\/g, '/');
  const lowered = posix.toLowerCase();
  let best = -1;
  for (const location of ruleLocations) {
    const index = lowered.lastIndexOf(`/${location}/`);
    if (index > best) {
      best = index;
    }
  }
  if (best === -1) {
    return undefined;
  }
  return path.normalize(posix.slice(0, best) || '/');
}

/**
 * scopeMatchesFile reports whether any of a rule's patterns matches a file.
 * @param patterns the rule's scope patterns
 * @param baseDir the folder the patterns are relative to
 * @param filePath the file to test, as an absolute path
 */
export function scopeMatchesFile(patterns: string[], baseDir: string, filePath: string): boolean {
  if (patterns.length === 0 || !filePath) {
    return false;
  }
  const relative = path.relative(baseDir, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  return patterns.some(pattern => matchesGlob(relative, cleanPattern(pattern)));
}
