/**
 * Reading YAML front matter without a YAML dependency.
 *
 * Two readers share the scalar helpers here:
 * - parseFrontMatter is strict. It accepts only flat `key: value` front
 *   matter and returns undefined for anything else, so the notebook renderer
 *   never shows a table that misrepresents the YAML.
 * - readFrontMatterFields is lenient. It picks out the top-level scalar and
 *   list fields and steps over whatever it does not understand, which is what
 *   the side bar needs to find a `name` or `description` in a skill file that
 *   also carries a nested `metadata` map.
 *
 * This module is shared by the extension and the notebook renderer bundle, so
 * it must not import `vscode` or Node built-ins.
 */

/** A front matter value: a scalar, or a list of scalars. */
export type FrontMatterValue = string | string[];

const keyLine = /^([A-Za-z0-9_][\w.-]*)[ \t]*:(?:[ \t]+(.*))?$/;

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

    const match = keyLine.exec(line);
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
 * extractFrontMatter returns the YAML between the `---` markers at the very
 * top of a markdown document, without the markers.
 * @returns undefined when the document has no closed front matter block
 */
export function extractFrontMatter(content: string): string | undefined {
  // Drop a byte order mark, then normalize line endings
  const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return undefined;
  }
  for (let i = 1; i < lines.length; i++) {
    const marker = lines[i].trim();
    if (marker === '---' || marker === '...') {
      return lines.slice(1, i).join('\n');
    }
  }
  return undefined;
}

function isIndented(line: string): boolean {
  return /^[ \t]+\S/.test(line);
}

/**
 * readFrontMatterFields reads the top-level scalar and list fields of a
 * markdown document's front matter, skipping anything more complex.
 *
 * Block scalars (`|`, `>`) and wrapped plain scalars are folded into one
 * string. Nested maps, anchors and tags are skipped rather than failing, so
 * one unusual field does not hide the rest.
 */
export function readFrontMatterFields(content: string): Record<string, FrontMatterValue> {
  const fields: Record<string, FrontMatterValue> = {};
  const yaml = extractFrontMatter(content);
  if (yaml === undefined) {
    return fields;
  }
  const lines = yaml.split('\n');

  // Collects the indented lines that follow line i and returns the new index
  const takeIndented = (start: number): { text: string[]; next: number; } => {
    const text: string[] = [];
    let next = start;
    while (next + 1 < lines.length && (isIndented(lines[next + 1]) || !lines[next + 1].trim())) {
      // A blank line only continues the value when more indented text follows
      if (!lines[next + 1].trim()) {
        const more = lines.slice(next + 2).find(l => l.trim());
        if (!more || !isIndented(more)) {
          break;
        }
      }
      text.push(lines[next + 1]);
      next++;
    }
    return { text, next };
  };

  for (let i = 0; i < lines.length; i++) {
    const match = keyLine.exec(lines[i]);
    if (!match) {
      continue; // comments, blank lines and anything not at the top level
    }
    const key = match[1];
    const raw = (match[2] ?? '').trim();

    if (raw === '' || raw.startsWith('#')) {
      const { text, next } = takeIndented(i);
      i = next;
      const filled = text.filter(l => l.trim());
      const isList = filled.length > 0 && filled.every(l => /^[ \t]*-[ \t]+\S/.test(l));
      if (!isList) {
        if (filled.length === 0) {
          fields[key] = '';
        }
        continue; // a nested map: skipped
      }
      const items = filled.map(l => l.replace(/^[ \t]*-[ \t]+/, ''));
      if (items.some(item => /^[[{]/.test(item) || /^[\w.-]+[ \t]*:([ \t]|$)/.test(item))) {
        continue; // a list of lists or maps: skipped
      }
      fields[key] = items.map(scalar);
      continue;
    }

    if (/^[|>]/.test(raw)) {
      const { text, next } = takeIndented(i);
      i = next;
      const parts = text.map(l => l.trim());
      fields[key] = (raw.startsWith('|') ? parts.join('\n') : parts.filter(Boolean).join(' ')).trim();
      continue;
    }

    if (raw.startsWith('[')) {
      const items = raw.endsWith(']') ? flowList(raw) : undefined;
      if (items) {
        fields[key] = items;
      }
      continue;
    }

    if (/^[{&*!]/.test(raw)) {
      const { next } = takeIndented(i);
      i = next;
      continue;
    }

    // A plain or quoted scalar, possibly wrapped onto indented lines
    let value = scalar(raw);
    if (!/^['"]/.test(raw)) {
      const { text, next } = takeIndented(i);
      i = next;
      const wrapped = text.map(l => l.trim()).filter(Boolean);
      if (wrapped.length) {
        value = [value, ...wrapped].join(' ');
      }
    }
    fields[key] = value;
  }

  return fields;
}

/** frontMatterString returns a field as one string; a list is joined with commas. */
export function frontMatterString(value: FrontMatterValue | undefined): string {
  if (value === undefined) {
    return '';
  }
  return Array.isArray(value) ? value.join(', ') : value;
}
