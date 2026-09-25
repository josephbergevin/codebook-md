import type MarkdownIt from 'markdown-it';

/** A front matter value: a scalar, or a list of scalars. */
export type FrontMatterValue = string | string[];

/**
 * Removes matching single or double quotes around a YAML scalar.
 */
function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  if (!quoted) {
    return value;
  }
  // YAML escapes a single quote inside single quotes by doubling it
  return quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
}

/**
 * Reads a plain (unquoted) scalar, dropping a trailing ` # comment`.
 */
function plainScalar(value: string): string {
  return value.replace(/\s+#.*$/, '').trim();
}

/**
 * Reads one scalar, quoted or not.
 */
function scalar(value: string): string {
  const trimmed = value.trim();
  return /^['"]/.test(trimmed) ? unquote(trimmed) : plainScalar(trimmed);
}

/**
 * Splits a flow list (`[a, "b, c", d]`) into its items.
 * @returns undefined when the list is nested or unbalanced
 */
function flowList(value: string): string[] | undefined {
  const inner = value.trim().slice(1, -1);
  if (/[[\]{}]/.test(inner)) {
    return undefined;
  }
  const items: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = '';
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(scalar(current));
      current = '';
    } else {
      current += ch;
    }
  }
  if (quote) {
    return undefined;
  }
  if (current.trim()) {
    items.push(scalar(current));
  }
  return items;
}

/**
 * Parses the common, flat shape of YAML front matter: top-level
 * `key: value` pairs whose values are scalars or lists of scalars.
 *
 * This is deliberately not a YAML parser. Anything beyond that shape -
 * nested maps, block scalars (`|`, `>`), anchors, tags - returns undefined
 * so the caller can show the front matter as YAML source instead of a
 * table that misrepresents it.
 */
export function parseFrontMatter(yaml: string): [string, FrontMatterValue][] | undefined {
  const entries: [string, FrontMatterValue][] = [];
  const lines = yaml.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) {
      continue;
    }

    const match = /^([A-Za-z0-9_][\w.-]*)[ \t]*:(?:[ \t]+(.*))?$/.exec(line);
    if (!match) {
      return undefined;
    }
    const key = match[1];
    const raw = (match[2] ?? '').trim();

    if (raw === '' || raw.startsWith('#')) {
      // Either an empty value or a block list on the following lines
      const items: string[] = [];
      while (i + 1 < lines.length && /^[ \t]*-[ \t]+\S/.test(lines[i + 1])) {
        const item = lines[i + 1].replace(/^[ \t]*-[ \t]+/, '');
        if (/^[[{]/.test(item) || /^[\w.-]+[ \t]*:([ \t]|$)/.test(item)) {
          return undefined; // list of lists or maps
        }
        items.push(scalar(item));
        i++;
      }
      entries.push([key, items.length ? items : '']);
      continue;
    }

    if (raw.startsWith('[')) {
      if (!raw.endsWith(']')) {
        return undefined;
      }
      const items = flowList(raw);
      if (!items) {
        return undefined;
      }
      entries.push([key, items]);
      continue;
    }

    if (/^[|>{&*!]/.test(raw)) {
      return undefined;
    }
    entries.push([key, scalar(raw)]);
  }

  return entries.length ? entries : undefined;
}

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
