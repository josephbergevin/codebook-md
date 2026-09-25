import MarkdownIt from 'markdown-it';
import { checkboxHtml, taskListPlugin } from '../../notebookRenderer/taskLists';

/**
 * Renders markdown with the same options the notebook renderer uses
 * (html + linkify) and the task list plugin applied.
 */
function render(markdown: string): string {
  const md = new MarkdownIt({ html: true, linkify: true });
  md.use(taskListPlugin);
  return md.render(markdown);
}

describe('taskListPlugin', () => {
  describe('unchecked item', () => {
    test('renders an unchecked checkbox in place of the marker', () => {
      const html = render('- [ ] write tests');
      expect(html).toContain('<span class="task-list-item-checkbox" role="checkbox" aria-checked="false" data-line="0"></span>write tests');
    });

    test('marks the list item and the list with the preview classes', () => {
      const html = render('- [ ] write tests');
      expect(html).toContain('<ul class="contains-task-list">');
      expect(html).toContain('<li class="task-list-item">');
    });
  });

  describe('checked item', () => {
    test('renders a checked checkbox for a lowercase x', () => {
      expect(render('- [x] done')).toContain('aria-checked="true"');
    });

    test('renders a checked checkbox for an uppercase X', () => {
      expect(render('- [X] done')).toContain('aria-checked="true"');
    });
  });

  describe('source line tracking', () => {
    test('records each item\'s 0-based line within the cell', () => {
      const html = render('Intro\n\n- [ ] first\n- [x] second');
      expect(html).toContain('data-line="2"');
      expect(html).toContain('data-line="3"');
    });
  });

  describe('non-task content', () => {
    test('leaves an ordinary list item unchanged', () => {
      const html = render('- plain item');
      expect(html).toBe('<ul>\n<li>plain item</li>\n</ul>\n');
    });

    test('ignores brackets that are not at the start of the item', () => {
      expect(render('- see [ ] here')).not.toContain('task-list-item');
    });

    test('ignores a marker with no space after it', () => {
      expect(render('- [x]done')).not.toContain('task-list-item');
    });

    test('ignores a marker in a plain paragraph', () => {
      expect(render('[ ] not in a list')).not.toContain('task-list-item');
    });

    test('ignores a marker that is a link reference', () => {
      expect(render('- [x](https://example.com)')).not.toContain('task-list-item-checkbox');
    });
  });

  describe('mixed and nested lists', () => {
    test('classes only the items that are tasks', () => {
      const html = render('- [ ] task\n- plain');
      expect(html).toContain('<li class="task-list-item">');
      expect(html).toContain('<li>plain</li>');
    });

    test('marks a nested task list without marking the outer list', () => {
      const html = render('- outer\n  - [ ] inner');
      expect(html).toMatch(/^<ul>\n<li>outer\n<ul class="contains-task-list">/);
    });

    test('works in an ordered list', () => {
      expect(render('1. [ ] first')).toContain('<ol class="contains-task-list">');
    });
  });
});

describe('checkboxHtml', () => {
  test('omits data-line when the source line is unknown', () => {
    expect(checkboxHtml(false, undefined)).not.toContain('data-line');
  });
});
