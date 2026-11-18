import * as path from 'path';
import { DocType, docTypeInfo } from '../docTypes';

/**
 * HTML fragments shared by the rows of the My Notebooks tree.
 *
 * Everything interpolated into the page goes through escapeHtml: file names,
 * front matter text and paths all come from the workspace.
 */

/** escapeHtml escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * docIconHtml returns the codicon for a doc type. The `doc-<type>` class
 * carries the tint, which the template maps to theme colors.
 */
export function docIconHtml(type: DocType): string {
  const info = docTypeInfo(type);
  return `<span class="codicon codicon-${info.icon} doc-icon doc-${info.id}" aria-hidden="true"></span>`;
}

/** titleAttr returns a ` title="..."` attribute, or nothing when there is no text. */
export function titleAttr(tooltip: string | undefined): string {
  return tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
}

/** hintHtml returns the dimmed text shown after a row's name, or nothing. */
export function hintHtml(hint: string | undefined): string {
  return hint ? `<span class="row-hint">${escapeHtml(hint)}</span>` : '';
}

/** plainFileIconHtml returns the icon for a file that is not markdown. */
export function plainFileIconHtml(): string {
  return '<span class="codicon codicon-file doc-icon" aria-hidden="true"></span>';
}

/**
 * comparablePath puts a file path into the one form used to match a row to
 * the file open in the editor. Windows paths compare without regard to case.
 */
export function comparablePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * activeRowAttrs returns the attributes that tie a row to its file: the
 * `data-abs` path the page matches against when the open file changes, and
 * `data-active` when the row is the open file right now.
 * @param absPath the row's absolute path
 * @param activePaths the open file's paths, already through comparablePath
 */
export function activeRowAttrs(absPath: string, activePaths: string[]): string {
  const comparable = comparablePath(absPath);
  const marker = activePaths.includes(comparable) ? ' data-active="true"' : '';
  return ` data-abs="${escapeHtml(comparable)}"${marker}`;
}
