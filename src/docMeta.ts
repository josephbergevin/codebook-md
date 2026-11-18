import * as fs from 'fs';
import * as path from 'path';
import { isExecutableLanguage } from './codebook';
import { classifyDocPath, DocType, docTypeInfo, prettifyName, skillFileName } from './docTypes';
import { extractFrontMatter, FrontMatterValue, frontMatterString, readFrontMatterFields } from './frontMatterFields';

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
  // File size in bytes; unset when the file could not be read
  size?: number;
  // The file opens a front matter block with `---` and never closes it
  unclosedFrontMatter?: boolean;
  // Targets of the file's relative markdown links, as written
  links?: string[];
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
// The most link targets kept per file
const maxLinks = 200;

/**
 * relativeLinks lists the targets of a markdown document's links and images
 * that point at other files: no web addresses, no in-page anchors. Fragments
 * and queries are dropped. Text inside code is not read.
 */
export function relativeLinks(content: string): string[] {
  // Drop fenced blocks, then inline code, so example links are not counted
  const lines: string[] = [];
  let closing = '';
  for (const line of content.split(/\r?\n/)) {
    const match = fenceOpen.exec(line);
    if (closing) {
      if (match && match[1].startsWith(closing) && !match[2]) {
        closing = '';
      }
      continue;
    }
    if (match) {
      closing = match[1];
      continue;
    }
    lines.push(line.replace(/`[^`]*`/g, ''));
  }

  const links: string[] = [];
  const linkPattern = /\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  let found: RegExpExecArray | null;
  while ((found = linkPattern.exec(lines.join('\n'))) !== null && links.length < maxLinks) {
    let target = (found[1] ?? found[2]).split('#')[0].split('?')[0];
    // Web addresses, mail links, anchors and site-absolute paths are not files next to this one
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) {
      continue;
    }
    try {
      target = decodeURIComponent(target);
    } catch {
      // Not percent-encoded after all: keep it as written
    }
    if (!links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}

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
  const meta: DocMeta = { type: pathType, fields: {}, size };
  if (size > maxReadBytes) {
    return meta;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  meta.fields = readFrontMatterFields(content);
  const body = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  meta.unclosedFrontMatter = /^---[ \t]*\r?\n/.test(body) && extractFrontMatter(content) === undefined;
  meta.links = relativeLinks(content);
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
/** What docTooltip adds to the basics, when a caller has it. */
export interface TooltipDetails {
  // Other paths that lead to the same file
  aliases?: string[];
  // A rule's scope patterns
  scope?: string[];
  // Problems found with the doc
  issues?: string[];
}

/**
 * docSizeText describes how much of an agent's context a doc takes: its file
 * size and a token estimate, e.g. "6.3 KB, about 1,600 tokens". The estimate
 * is bytes divided by four, a common rule of thumb, rounded to two figures.
 * Only instruction files and rules get one, since those load unasked.
 */
export function docSizeText(meta: DocMeta): string | undefined {
  if (meta.size === undefined || (meta.type !== 'instructions' && meta.type !== 'rule')) {
    return undefined;
  }
  const size = meta.size < 1000 ? `${meta.size} bytes` : `${(meta.size / 1000).toFixed(1)} KB`;
  const raw = meta.size / 4;
  if (raw < 1) {
    return size;
  }
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  const tokens = Math.round(raw / step) * step;
  return `${size}, about ${tokens.toLocaleString('en-US')} tokens`;
}

/**
 * docTooltip builds the hover text for a file's row: what kind of doc it is,
 * its exact name, its description, any problems, the files it is scoped to,
 * its size, where it lives and any other paths that lead to the same file.
 */
export function docTooltip(meta: DocMeta, relativePath: string, details: TooltipDetails = {}): string {
  const { aliases = [], scope = [], issues = [] } = details;
  const lines: string[] = [];
  const info = docTypeInfo(meta.type);
  if (meta.type !== 'markdown') {
    lines.push(meta.name ? `${info.label}: ${meta.name}` : info.label);
  }
  if (meta.description) {
    lines.push(meta.description);
  }
  issues.forEach(issue => lines.push(`Problem: ${issue}`));
  if (scope.length) {
    lines.push(`Applies to: ${scope.join(', ')}`);
  }
  const size = docSizeText(meta);
  if (size) {
    lines.push(size);
  }
  lines.push(relativePath);
  if (aliases.length) {
    lines.push(`Also at: ${aliases.join(', ')}`);
  }
  return lines.join('\n');
}
