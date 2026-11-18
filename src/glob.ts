/**
 * A small glob matcher for workspace-relative paths.
 *
 * Supports the subset that folder inclusions and scoped rules use:
 * `*` (within one path segment), `?`, `**` (any number of segments),
 * `{a,b}` alternatives and `[...]` character classes. Paths and patterns
 * use forward slashes; backslashes in either are treated as separators.
 */

const globChars = /[*?[\]{}]/;

/** toPosix normalizes a path or pattern to forward slashes without a leading `./` or trailing `/`. */
export function toPosix(value: string): string {
  return value.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
}

/**
 * isGlobPattern reports whether an inclusion entry is a pattern rather than a
 * plain folder name: it has a wildcard, or it spells out a path.
 */
export function isGlobPattern(value: string): boolean {
  return globChars.test(value) || toPosix(value).includes('/');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * globToRegExp compiles a glob pattern to an anchored regular expression.
 *
 * `dir/**` also matches `dir` itself, and `**` + `/name` also matches `name`
 * at the top level, which is how these patterns are read everywhere else.
 */
export function globToRegExp(pattern: string): RegExp {
  const glob = toPosix(pattern);
  let source = '';
  let braceDepth = 0;

  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];

    if (ch === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        const next = glob[i + 2];
        if (atSegmentStart && next === '/') {
          // `**/` - zero or more leading segments
          source += '(?:.*/)?';
          i += 2;
        } else if (atSegmentStart && next === undefined && source.endsWith('\\/')) {
          // trailing `/**` - the folder itself or anything below it
          source = source.slice(0, -2) + '(?:/.*)?';
          i += 1;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (ch === '?') {
      source += '[^/]';
      continue;
    }

    if (ch === '[') {
      const close = glob.indexOf(']', i + 2);
      if (close !== -1) {
        let body = glob.slice(i + 1, close);
        if (body.startsWith('!')) {
          body = '^' + body.slice(1);
        }
        source += '[' + body.replace(/\\/g, '\\\\') + ']';
        i = close;
        continue;
      }
      source += '\\[';
      continue;
    }

    if (ch === '{' && glob.indexOf('}', i) !== -1) {
      braceDepth++;
      source += '(?:';
      continue;
    }
    if (ch === '}' && braceDepth > 0) {
      braceDepth--;
      source += ')';
      continue;
    }
    if (ch === ',' && braceDepth > 0) {
      source += '|';
      continue;
    }

    source += escapeRegExp(ch);
  }

  return new RegExp('^' + source + '$');
}

/** matchesGlob reports whether a relative path matches a glob pattern. */
export function matchesGlob(relativePath: string, pattern: string): boolean {
  try {
    return globToRegExp(pattern).test(toPosix(relativePath));
  } catch (error) {
    console.log(`Invalid glob pattern "${pattern}":`, error);
    return false;
  }
}

/**
 * globLiteralPrefix returns the folder path a pattern is anchored to: the
 * path segments before the first one that holds a wildcard.
 *
 * `tooling/**` gives `tooling`, `docs/*.md` gives `docs`, and a pattern
 * with no fixed start such as `**` + `/docs` gives an empty string.
 */
export function globLiteralPrefix(pattern: string): string {
  const segments = toPosix(pattern).split('/');
  const literal: string[] = [];
  for (const segment of segments) {
    if (globChars.test(segment)) {
      break;
    }
    literal.push(segment);
  }
  return literal.join('/');
}
