import type MarkdownIt from 'markdown-it';
import { hashCellText } from './taskToggle';

type Token = MarkdownIt.Token;

/**
 * Matches a GitHub-style task marker at the start of a list item:
 * `[ ]`, `[x]` or `[X]`, followed by whitespace or the end of the text.
 */
const TASK_MARKER = /^\[([ xX])\](?=\s|$)\s*/;

/**
 * Escapes a value for use inside a double-quoted HTML attribute.
 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Builds the checkbox markup for a task list item.
 *
 * In untrusted workspaces the notebook markdown renderer sanitizes its
 * output and strips `<input>` elements, so the checkbox is a
 * `<span role="checkbox">` drawn with CSS. `data-line` (the item's 0-based
 * source line) and `data-cell` (a hash of the cell's text) let a click be
 * mapped back to the markdown source.
 *
 * An interactive checkbox is focusable; one that can't be toggled is
 * marked disabled instead, so keyboard and screen reader users aren't
 * offered a control that does nothing.
 */
export function checkboxHtml(
  checked: boolean,
  line: number | undefined,
  cellHash?: string,
  interactive = true
): string {
  const lineAttr = line === undefined ? '' : ` data-line="${escapeAttr(String(line))}"`;
  const cellAttr = cellHash === undefined ? '' : ` data-cell="${escapeAttr(cellHash)}"`;
  const stateAttr = interactive ? ' tabindex="0"' : ' aria-disabled="true"';
  return `<span class="task-list-item-checkbox" role="checkbox"${stateAttr} aria-checked="${checked}"${lineAttr}${cellAttr}></span>`;
}

/**
 * Options for taskListPlugin.
 */
export interface TaskListOptions {
  /** Whether checkboxes can be clicked to toggle them (default true) */
  interactive?: boolean;
}

/**
 * Adds a class to a token, keeping any class it already has.
 */
function addClass(token: Token, className: string): void {
  const existing = token.attrGet('class');
  if (!existing) {
    token.attrSet('class', className);
  } else if (!existing.split(/\s+/).includes(className)) {
    token.attrSet('class', `${existing} ${className}`);
  }
}

/**
 * Finds the index of the `bullet_list_open`/`ordered_list_open` token that
 * owns the list item opened at `itemIndex`.
 */
function findParentListOpen(tokens: Token[], itemIndex: number): number {
  const level = tokens[itemIndex].level - 1;
  for (let i = itemIndex - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.level === level && (t.type === 'bullet_list_open' || t.type === 'ordered_list_open')) {
      return i;
    }
  }
  return -1;
}

/**
 * markdown-it plugin that renders GitHub-style task list items
 * (`- [ ] todo`, `- [x] done`) as checkboxes, matching the classes the
 * VS Code Markdown Preview uses: `contains-task-list` on the list,
 * `task-list-item` on the item and `task-list-item-checkbox` on the box.
 */
export function taskListPlugin(md: MarkdownIt, options: TaskListOptions = {}): void {
  const interactive = options.interactive ?? true;
  md.core.ruler.after('inline', 'codebook_task_lists', (state) => {
    const tokens = state.tokens;
    let cellHash: string | undefined;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      // A task item is: list_item_open, paragraph_open, inline(content starts with the marker)
      if (inline.type !== 'inline'
        || tokens[i - 1].type !== 'paragraph_open'
        || tokens[i - 2].type !== 'list_item_open') {
        continue;
      }

      const firstChild = inline.children?.[0];
      if (!firstChild || firstChild.type !== 'text') {
        continue;
      }

      const match = TASK_MARKER.exec(firstChild.content);
      if (!match) {
        continue;
      }

      const checked = match[1] !== ' ';
      firstChild.content = firstChild.content.slice(match[0].length);

      // Hash lazily: most cells have no task items
      cellHash ??= hashCellText(state.src);
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = checkboxHtml(checked, inline.map?.[0], cellHash, interactive);
      inline.children!.unshift(checkbox);

      addClass(tokens[i - 2], 'task-list-item');
      const listOpen = findParentListOpen(tokens, i - 2);
      if (listOpen >= 0) {
        addClass(tokens[listOpen], 'contains-task-list');
      }
    }
  });
}
