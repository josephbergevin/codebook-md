import MarkdownIt from 'markdown-it';
import { copyButtonHtml, copyButtonPlugin } from '../../notebookRenderer/copyButton';

describe('copyButtonPlugin', () => {
  const md = new MarkdownIt().use(copyButtonPlugin);

  test('puts a copy button at the start of a fenced code block', () => {
    expect(md.render('```js\nlet a = 1;\n```')).toMatch(/^<pre><span class="code-block-copy-button"/);
  });

  test('keeps the code itself unchanged', () => {
    expect(md.render('```\nlet a = 1;\n```')).toContain('<code>let a = 1;\n</code>');
  });

  test('leaves indented code blocks alone', () => {
    expect(md.render('    indented')).not.toContain('code-block-copy-button');
  });
});

describe('copyButtonHtml', () => {
  test('uses a span with the button role, since <button> may be sanitized away', () => {
    expect(copyButtonHtml()).toMatch(/^<span class="code-block-copy-button" role="button" tabindex="0"/);
  });

  test('has no text of its own, so copying the block never includes it', () => {
    const div = copyButtonHtml().replace(/<[^>]+>/g, '');
    expect(div).toBe('');
  });
});
