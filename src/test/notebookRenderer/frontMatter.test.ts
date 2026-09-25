import MarkdownIt from 'markdown-it';
import { frontMatterPlugin, frontMatterTableHtml, parseFrontMatter } from '../../notebookRenderer/frontMatter';

describe('parseFrontMatter', () => {
  describe('supported shapes', () => {
    test('reads scalar values', () => {
      expect(parseFrontMatter('title: Hello\nauthor: Tess')).toEqual([['title', 'Hello'], ['author', 'Tess']]);
    });

    test('unquotes double- and single-quoted values', () => {
      expect(parseFrontMatter('a: "x: y"\nb: \'it\'\'s\'')).toEqual([['a', 'x: y'], ['b', "it's"]]);
    });

    test('drops a trailing comment from a plain value', () => {
      expect(parseFrontMatter('draft: true # for now')).toEqual([['draft', 'true']]);
    });

    test('keeps a # that is part of a quoted value', () => {
      expect(parseFrontMatter('tag: "#1"')).toEqual([['tag', '#1']]);
    });

    test('reads a block list', () => {
      expect(parseFrontMatter('tags:\n  - go\n  - "shell"')).toEqual([['tags', ['go', 'shell']]]);
    });

    test('reads a block list that is not indented', () => {
      expect(parseFrontMatter('tags:\n- go\n- shell')).toEqual([['tags', ['go', 'shell']]]);
    });

    test('reads a flow list, respecting quoted commas', () => {
      expect(parseFrontMatter('tags: [go, "a, b", shell]')).toEqual([['tags', ['go', 'a, b', 'shell']]]);
    });

    test('reads a key with no value as empty', () => {
      expect(parseFrontMatter('summary:\ntitle: x')).toEqual([['summary', ''], ['title', 'x']]);
    });

    test('skips blank lines and comments', () => {
      expect(parseFrontMatter('# comment\n\ntitle: x')).toEqual([['title', 'x']]);
    });

    test('handles CRLF line endings', () => {
      expect(parseFrontMatter('a: 1\r\nb: 2')).toEqual([['a', '1'], ['b', '2']]);
    });
  });

  describe('shapes shown as YAML source instead', () => {
    test.each([
      ['a nested map', 'author:\n  name: Tess'],
      ['a block scalar', 'summary: |\n  line one'],
      ['a folded scalar', 'summary: >\n  line one'],
      ['an inline map', 'author: {name: Tess}'],
      ['a nested flow list', 'm: [[1, 2]]'],
      ['a list of maps', 'people:\n  - name: Tess'],
      ['an anchor', 'a: &x 1'],
      ['a line that is not a key', 'just text'],
      ['nothing at all', '# only a comment'],
    ])('returns undefined for %s', (_name, yaml) => {
      expect(parseFrontMatter(yaml)).toBeUndefined();
    });
  });
});

describe('frontMatterTableHtml', () => {
  const md = new MarkdownIt();

  test('renders a row per key, with lists as bullet lists', () => {
    expect(frontMatterTableHtml([['title', 'Hi'], ['tags', ['a', 'b']]], md.utils.escapeHtml)).toBe(
      '<table class="frontmatter frontmatter-table"><tbody>'
      + '<tr><th>title</th><td>Hi</td></tr>'
      + '<tr><th>tags</th><td><ul><li>a</li><li>b</li></ul></td></tr>'
      + '</tbody></table>\n');
  });

  test('escapes HTML in keys and values', () => {
    const html = frontMatterTableHtml([['title', '<script>x</script>']], md.utils.escapeHtml);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('frontMatterPlugin', () => {
  /**
   * Renders a cell the way the notebook renderer does: a `text/x-yaml` cell
   * is wrapped in a yaml fence and the cell is passed as env.outputItem.
   */
  function renderCell(text: string, mime: string): string {
    const md = new MarkdownIt().use(frontMatterPlugin);
    const source = mime === 'text/x-yaml' ? '```yaml\n' + text + '\n```' : text;
    return md.render(source, { outputItem: { mime } });
  }

  test('renders a front matter cell as a table next to its YAML source', () => {
    const html = renderCell('title: Hello', 'text/x-yaml');
    expect(html).toMatch(/^<div class="frontmatter"><table class="frontmatter frontmatter-table">[\s\S]*<div class="frontmatter-source"><pre>/);
  });

  test('shows only the YAML source when the front matter is not table-shaped', () => {
    const html = renderCell('author:\n  name: Tess', 'text/x-yaml');
    expect(html).not.toContain('<table');
    expect(html).toContain('<div class="frontmatter-source"><pre>');
  });

  test('leaves yaml blocks in ordinary markdown cells alone', () => {
    const html = renderCell('```yaml\ntitle: Hello\n```', 'text/markdown');
    expect(html).not.toContain('frontmatter');
  });

  test('leaves blocks alone when no cell is being rendered', () => {
    const md = new MarkdownIt().use(frontMatterPlugin);
    expect(md.render('```yaml\na: 1\n```')).not.toContain('frontmatter');
  });
});
