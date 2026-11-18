import { AiDocGroup, AiDocRow, AiDocsRoot, rowAppliesTo } from '../aiDocs';
import {
  activeRowAttrs, appliesMarkHtml, comparablePath, docIconHtml, escapeHtml, hintHtml, issueMarkHtml, scopeChipHtml,
  titleAttr,
} from './notebooksViewHtml';

/**
 * Builds the AI Docs tree. The markup follows the ARIA tree pattern - a
 * `tree` of `treeitem`s, with each folder's children in a `group` - which is
 * what the page's keyboard handling and screen readers both work from.
 */

/** What the tree is drawn against: the file open in the editor. */
export interface AiDocsRenderState {
  // The open file's absolute path, for the "applies to this file" marks
  openFile?: string;
  // The same file in the forms rows are matched by (see activeFilePaths)
  activePaths: string[];
}

/** canApply reports whether a doc is the kind an agent loads on its own, so can be marked at all. */
function canApply(row: AiDocRow): boolean {
  return row.appliesEverywhere === true || row.scope !== undefined || row.appliesUnder !== undefined;
}

function docRowHtml(row: AiDocRow, level: number, state: AiDocsRenderState): string {
  const applies = rowAppliesTo(row, state.openFile);
  // What the filter box searches: name, description and path
  const filterText = [row.name, row.description ?? '', row.displayPath].join(' ').toLowerCase();
  const attrs = [
    'class="row doc-row"',
    'role="treeitem"',
    `aria-level="${level}"`,
    'tabindex="-1"',
    `data-item-path="${escapeHtml(row.filePath)}"`,
    `data-filter="${escapeHtml(filterText)}"`,
  ].join(' ');
  return `<div ${attrs}${activeRowAttrs(row.filePath, state.activePaths)}${applies ? ' data-applies="true"' : ''}${titleAttr(row.tooltip)}>` +
    docIconHtml(row.docType) +
    `<span class="row-name">${escapeHtml(row.name)}</span>` +
    hintHtml(row.hint) +
    scopeChipHtml(row.scope) +
    issueMarkHtml(row.issues) +
    (canApply(row) ? appliesMarkHtml(true) : '') +
    '</div>';
}

function nodeHtml(key: string, title: string, iconHtml: string, count: number, level: number, children: string): string {
  return `<div class="node" role="treeitem" aria-expanded="true" aria-level="${level}" tabindex="-1" data-node="${escapeHtml(key)}">` +
    '<div class="row node-row">' +
    '<span class="codicon codicon-chevron-down twistie" aria-hidden="true"></span>' +
    iconHtml +
    `<span class="node-title">${escapeHtml(title)}</span>` +
    `<span class="count">${count}</span>` +
    '</div>' +
    `<div class="children" role="group">${children}</div>` +
    '</div>';
}

function groupHtml(rootKey: string, group: AiDocGroup, level: number, state: AiDocsRenderState): string {
  const rows = group.rows.map(row => docRowHtml(row, level + 1, state)).join('');
  return nodeHtml(`${rootKey}/${group.key}`, group.title, '', group.rows.length, level, rows);
}

/**
 * aiDocsTreeHtml builds the tree for the roots that have agent docs. With one
 * such root its groups are the top level; with several - a workspace of more
 * than one folder, or your user-level docs - each root is a folder of its own.
 * @returns an empty string when no root has any docs
 */
export function aiDocsTreeHtml(roots: AiDocsRoot[], state: AiDocsRenderState): string {
  const shown = roots
    .map((root, index) => ({ root, key: `root-${index}` }))
    .filter(entry => entry.root.groups.length > 0);
  if (shown.length === 0) {
    return '';
  }
  if (shown.length === 1) {
    const { root, key } = shown[0];
    return root.groups.map(group => groupHtml(key, group, 1, state)).join('') + truncatedHtml(root);
  }
  return shown.map(({ root, key }) => {
    const icon = `<span class="codicon codicon-${root.isUser ? 'account' : 'root-folder'} root-icon" aria-hidden="true"></span>`;
    const count = root.groups.reduce((sum, group) => sum + group.rows.length, 0);
    const children = root.groups.map(group => groupHtml(key, group, 2, state)).join('') + truncatedHtml(root);
    return nodeHtml(key, root.name, icon, count, 1, children);
  }).join('');
}

function truncatedHtml(root: AiDocsRoot): string {
  return root.truncated
    ? '<p class="note">This folder is too large to look through completely, so some agent docs may be missing.</p>'
    : '';
}

/**
 * appliesPaths lists the docs that apply to the open file, as the paths their
 * rows carry in `data-abs`, for moving the marks without redrawing the tree.
 */
export function appliesPaths(roots: AiDocsRoot[], openFile: string | undefined): string[] {
  const paths: string[] = [];
  for (const root of roots) {
    for (const group of root.groups) {
      for (const row of group.rows) {
        if (rowAppliesTo(row, openFile)) {
          paths.push(comparablePath(row.filePath));
        }
      }
    }
  }
  return paths;
}
