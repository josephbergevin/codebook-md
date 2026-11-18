import * as fs from 'fs';
import * as path from 'path';
import { isExecutableLanguage } from './codebook';
import { classifyDocPath, DocType, docTypeInfo, prettifyName, skillFileName } from './docTypes';
import { FrontMatterValue, frontMatterString, readFrontMatterFields } from './frontMatterFields';

/**
 * What the side bar knows about one markdown file: its type, and the name and
 * description its front matter gives it.
 *
 * Reading a file is the slow part of building the tree, so results are cached
 * and reused until the file's modified time or size changes.
 */
export interface DocMeta {
  type: DocType;
  // Front matter `name`, exactly as written
  name?: string;
  // Front matter `title`, exactly as written
  title?: string;
  description?: string;
  // The top-level front matter fields, for callers that need more
  fields: Record<string, FrontMatterValue>;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  meta: DocMeta;
}

const cache = new Map<string, CacheEntry>();

// Files larger than this are classified by path alone
const maxReadBytes = 512 * 1024;
// Keeps the cache from growing without bound in a very large workspace
const maxCacheEntries = 5000;

const fenceOpen = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([\w#+.-]+)?/;

/**
 * hasExecutableCodeBlock reports whether markdown holds at least one fenced
 * code block in a language CodebookMD can run.
 */
export function hasExecutableCodeBlock(content: string): boolean {
  const lines = content.split(/\r?\n/);
  let closing = '';
  for (const line of lines) {
    const match = fenceOpen.exec(line);
    if (!match) {
      continue;
    }
    if (closing) {
      // Inside a block: only a bare fence of the same kind and length closes it
      if (match[1].startsWith(closing) && !match[2]) {
        closing = '';
      }
      continue;
    }
    if (match[2] && isExecutableLanguage(match[2])) {
      return true;
    }
    closing = match[1];
  }
  return false;
}

function readMeta(filePath: string, size: number): DocMeta {
  const pathType = classifyDocPath(filePath);
  const meta: DocMeta = { type: pathType, fields: {} };
  if (size > maxReadBytes) {
    return meta;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  meta.fields = readFrontMatterFields(content);
  meta.name = frontMatterString(meta.fields.name) || undefined;
  meta.title = frontMatterString(meta.fields.title) || undefined;
  meta.description = frontMatterString(meta.fields.description) || undefined;

  // Content only decides the type when the path said nothing
  if (pathType === 'markdown' && hasExecutableCodeBlock(content)) {
    meta.type = 'notebook';
  }
  return meta;
}

/**
 * getDocMeta returns the cached metadata for a markdown file, reading the
 * file only when it is new or has changed. A file that cannot be read is
 * classified by its path.
 */
export function getDocMeta(filePath: string): DocMeta {
  try {
    const stats = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.meta;
    }
    const meta = readMeta(filePath, stats.size);
    if (cache.size >= maxCacheEntries) {
      cache.clear();
    }
    cache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, meta });
    return meta;
  } catch (error) {
    // A missing file is routine: saved folder groups can point at files that
    // have since moved. Anything else is worth a line in the log.
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.log(`Could not read markdown metadata for ${filePath}:`, error);
    }
    return { type: classifyDocPath(filePath), fields: {} };
  }
}

/** clearDocMetaCache forgets every cached file. */
export function clearDocMetaCache(): void {
  cache.clear();
}

/**
 * docDisplayName picks the label for a file's row.
 *
 * Agent docs are named by their front matter: a `title` as written, or a
 * `name` turned into a title. A skill without either takes its folder's name,
 * since every skill file is called SKILL.md. Other files keep `fallback`, the
 * label derived from the file name.
 */
export function docDisplayName(filePath: string, meta: DocMeta, fallback: string): string {
  if (!docTypeInfo(meta.type).isAgentDoc) {
    return fallback;
  }
  if (meta.title) {
    return meta.title;
  }
  if (meta.name) {
    return prettifyName(meta.name);
  }
  if (path.basename(filePath).toLowerCase() === skillFileName.toLowerCase()) {
    return prettifyName(path.basename(path.dirname(filePath)));
  }
  return fallback;
}

/**
 * docTooltip builds the hover text for a file's row: what kind of doc it is,
 * its exact name, its description, the files it is scoped to, where it lives
 * and any other paths that lead to the same file.
 */
export function docTooltip(meta: DocMeta, relativePath: string, aliases: string[] = [], scope: string[] = []): string {
  const lines: string[] = [];
  const info = docTypeInfo(meta.type);
  if (meta.type !== 'markdown') {
    lines.push(meta.name ? `${info.label}: ${meta.name}` : info.label);
  }
  if (meta.description) {
    lines.push(meta.description);
  }
  if (scope.length) {
    lines.push(`Applies to: ${scope.join(', ')}`);
  }
  lines.push(relativePath);
  if (aliases.length) {
    lines.push(`Also at: ${aliases.join(', ')}`);
  }
  return lines.join('\n');
}
