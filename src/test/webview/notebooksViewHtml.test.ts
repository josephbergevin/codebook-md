import { docTypes } from '../../docTypes';
import {
  activeRowAttrs, comparablePath, docIconHtml, escapeHtml, hintHtml, plainFileIconHtml, titleAttr,
} from '../../webview/notebooksViewHtml';
import * as fs from 'fs';
import * as path from 'path';

describe('docIconHtml', () => {
  test('renders the codicon for the type with a class for its tint', () => {
    expect(docIconHtml('skill')).toBe('<span class="codicon codicon-mortar-board doc-icon doc-skill" aria-hidden="true"></span>');
  });

  test('uses an icon that the bundled codicon font has', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../node_modules/@vscode/codicons/dist/codicon.css'), 'utf8');
    for (const info of docTypes) {
      expect(css).toContain(`.codicon-${info.icon}:before`);
    }
  });

  test('has a tint in the template for every type that is not plain markdown', () => {
    const template = fs.readFileSync(path.join(__dirname, '../../webview/templates/notebooks.html'), 'utf8');
    for (const info of docTypes.filter(t => !['markdown', 'license', 'policy'].includes(t.id))) {
      expect(template).toContain(`.doc-${info.id} {`);
    }
  });
});

describe('plainFileIconHtml', () => {
  test('uses an icon that the bundled codicon font has', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../node_modules/@vscode/codicons/dist/codicon.css'), 'utf8');
    expect(plainFileIconHtml()).toContain('codicon-file ');
    expect(css).toContain('.codicon-file:before');
  });
});

describe('activeRowAttrs', () => {
  const row = path.join(path.sep, 'repo', 'docs', 'guide.md');

  test('carries the row\'s path for the page to match against', () => {
    expect(activeRowAttrs(row, [])).toBe(` data-abs="${escapeHtml(comparablePath(row))}"`);
  });

  test('marks the row of the open file', () => {
    expect(activeRowAttrs(row, [comparablePath(row)])).toContain(' data-active="true"');
  });

  test('matches a path that is written differently', () => {
    const roundabout = path.join(path.sep, 'repo', 'src', '..', 'docs', 'guide.md');
    expect(activeRowAttrs(roundabout, [comparablePath(row)])).toContain(' data-active="true"');
  });

  test('leaves other rows unmarked', () => {
    expect(activeRowAttrs(row, [comparablePath(path.join(path.sep, 'repo', 'README.md'))])).not.toContain('data-active');
  });

  test('escapes the path', () => {
    expect(activeRowAttrs(path.join(path.sep, 'repo', 'a"b.md'), [])).toContain('a&quot;b.md');
  });
});

describe('the template', () => {
  const template = fs.readFileSync(path.join(__dirname, '../../webview/templates/notebooks.html'), 'utf8');

  test('styles the open file\'s row and listens for the open file changing', () => {
    expect(template).toContain('.file[data-active="true"]');
    expect(template).toContain('"setActiveFile"');
  });
});

describe('titleAttr', () => {
  test('escapes the hover text', () => {
    expect(titleAttr('a "b" <c>')).toBe(' title="a &quot;b&quot; &lt;c&gt;"');
  });

  test('renders nothing without text', () => {
    expect(titleAttr(undefined)).toBe('');
  });
});

describe('hintHtml', () => {
  test('escapes the hint', () => {
    expect(hintHtml('also <x>.md')).toBe('<span class="row-hint">also &lt;x&gt;.md</span>');
  });

  test('renders nothing without a hint', () => {
    expect(hintHtml(undefined)).toBe('');
  });
});

describe('escapeHtml', () => {
  test('escapes quotes so text is safe inside an inline handler', () => {
    expect(escapeHtml(`it's "x" & <y>`)).toBe('it&#039;s &quot;x&quot; &amp; &lt;y&gt;');
  });
});
