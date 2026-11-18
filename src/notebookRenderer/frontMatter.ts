import type MarkdownIt from 'markdown-it';
import type { FrontMatterValue } from '../frontMatterFields';
import { parseFrontMatter } from '../frontMatterFields';

// The parser lives in a module the extension shares; re-exported so the
// renderer's callers keep one import
export type { FrontMatterValue };
export { parseFrontMatter };

/**
 * Builds the front matter table, matching the Markdown Preview's
 * `table.frontmatter` markup.
 */
export function frontMatterTableHtml(entries: [string, FrontMatterValue][], escapeHtml: (s: string) => string): string {
  const rows = entries.map(([key, value]) => {
    const cell = Array.isArray(value)
      ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : escapeHtml(value);
    return `<tr><th>${escapeHtml(key)}</th><td>${cell}</td></tr>`;
  });
  return `<table class="frontmatter frontmatter-table"><tbody>${rows.join('')}</tbody></table>\n`;
}

/**
 * The parts of the render environment this plugin reads. The notebook
 * renderer passes the cell being rendered as `env.outputItem`.
 */
interface RenderEnv {
  outputItem?: { mime?: string };
}

/**
 * markdown-it plugin that renders a CodebookMD front matter cell as a
 * key/value table like the Markdown Preview does.
 *
 * CodebookMD shows front matter as a markup cell with language `yaml`, which
 * the notebook renderer receives as `text/x-yaml` and wraps in a fenced
 * block. When that block is the whole cell, the table is emitted next to the
 * original block; CSS shows the table while preview styling is on and the
 * YAML source otherwise (or when the front matter isn't table-shaped).
 */
export function frontMatterPlugin(md: MarkdownIt): void {
  const previousFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env: RenderEnv, self) => {
    const source = previousFence
      ? previousFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    const isFrontMatterCell = env?.outputItem?.mime === 'text/x-yaml' && tokens.length === 1;
    if (!isFrontMatterCell) {
      return source;
    }

    const entries = parseFrontMatter(tokens[idx].content);
    const table = entries ? frontMatterTableHtml(entries, md.utils.escapeHtml) : '';
    return `<div class="frontmatter">${table}<div class="frontmatter-source">${source}</div></div>\n`;
  };
}
