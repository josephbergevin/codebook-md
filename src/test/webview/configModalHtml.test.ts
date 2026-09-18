import { ConfigField } from '../../webview/cellConfigFields';
import { escapeHtml, ModalRenderParams, renderConfigModalHtml, safeJson } from '../../webview/configModalHtml';

const fields: ConfigField[] = [
  {
    id: 'persistentSession', group: 'language', label: 'Persistent shell session', description: 'Keep state.',
    type: 'boolean', settingId: 'codebook-md.bash.persistentSession', inheritedValue: false, inheritedSource: 'default',
  },
  {
    id: 'output.timestampTimezone', group: 'output', label: 'Timestamp timezone', description: 'Zone.',
    type: 'string', settingId: 'codebook-md.output.timestampTimezone', inheritedValue: 'UTC', inheritedSource: 'default',
    cellValue: '</script><img src=x onerror=alert(1)>',
  },
];

function params(overrides: Partial<ModalRenderParams> = {}): ModalRenderParams {
  return {
    cspSource: 'vscode-webview://abc',
    nonce: 'n0nce',
    notebookUri: 'file:///notes/demo.md',
    cell: { uri: 'vscode-notebook-cell:/notes/demo.md#W1', index: 2, languageId: 'shellscript' },
    frontMatter: 'title: </textarea><script>alert(1)</script>',
    fields,
    cellCommands: ['# [>].execPath("./scratch")'],
    availableCommands: ['# [>].output.timestampTimezone("UTC")'],
    history: { enabled: true, historyLimit: 10, target: 'workspace' },
    ...overrides,
  };
}

// scripts returns the contents of every <script> element in the page
function scripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

describe('escapeHtml / safeJson', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('cannot close a script element', () => {
    const json = safeJson({ text: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('</script');
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script>' });
  });
});

describe('renderConfigModalHtml', () => {
  it('restricts scripts to the nonce with a Content-Security-Policy', () => {
    const html = renderConfigModalHtml(params());
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(`script-src &#39;nonce-n0nce&#39;`);
    expect(html).toContain('<script nonce="n0nce">');
  });

  it('has no inline event handlers', () => {
    // outside the script element - the escaped page data may contain such text
    const markup = renderConfigModalHtml(params()).replace(/<script\b[\s\S]*?<\/script>/g, '');
    expect(markup).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('has exactly one script, and it only closes where intended', () => {
    const html = renderConfigModalHtml(params());
    expect(scripts(html)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('produces a page script that parses', () => {
    const [script] = scripts(renderConfigModalHtml(params()));
    expect(() => new Function(script)).not.toThrow();
  });

  it('escapes front matter and in-cell commands', () => {
    const html = renderConfigModalHtml(params());
    expect(html).toContain('title: &lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>');
    expect(html).toContain('<code class="command-name"># [&gt;].execPath(&quot;./scratch&quot;)</code>');
    expect(html).toContain('data-text="# [&gt;].output.timestampTimezone(&quot;UTC&quot;)"');
  });

  it('renders a control, a setting link and a reset button per field', () => {
    const html = renderConfigModalHtml(params());
    expect(html).toContain('<input type="checkbox" id="field-persistentSession" data-field="persistentSession">');
    expect(html).toContain('data-setting="codebook-md.bash.persistentSession"');
    expect(html).toContain('data-action="reset-field" data-field="output.timestampTimezone"');
    expect(html).toContain('Cell 3 &middot; shellscript');
  });

  it('does not give the history controls form names that could be saved as cell config', () => {
    const html = renderConfigModalHtml(params());
    expect(html).not.toMatch(/name="executionHistory/);
    expect(html).toContain('change the workspace setting for every notebook');
  });

  it('shows only the notebook settings when there is no cell', () => {
    const html = renderConfigModalHtml(params({ cell: undefined, fields: [] }));
    expect(html).not.toContain('id="configForm"');
    expect(html).not.toContain('data-action="save"');
    expect(html).toContain('data-action="save-front-matter"');
  });
});
