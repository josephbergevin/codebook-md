/**
 * @jest-environment jsdom
 */
import * as path from 'path';
import { AiDocRow, AiDocsRoot } from '../../aiDocs';
import { aiDocsTreeHtml, appliesPaths } from '../../webview/aiDocsViewHtml';
import { comparablePath } from '../../webview/notebooksViewHtml';

const repo = path.join(path.sep, 'work', 'repo');

function doc(overrides: Partial<AiDocRow> & { displayPath: string; }): AiDocRow {
  return {
    name: 'Doc',
    filePath: path.join(repo, overrides.displayPath),
    docType: 'markdown',
    tooltip: overrides.displayPath,
    issues: [],
    ...overrides,
  };
}

const agents = doc({ name: 'Agents', displayPath: 'AGENTS.md', docType: 'instructions', hint: 'workspace root', appliesUnder: repo });
const webRule = doc({
  name: 'Web Rules', displayPath: '.claude/rules/web.md', docType: 'rule', scope: ['src/webview/**', 'media/**'], scopeBase: repo,
});
const deploy = doc({
  name: 'Deploy', displayPath: '.agents/skills/deploy/SKILL.md', docType: 'skill',
  description: 'Ships the <app>', issues: ['No name in the front matter'],
});

const workspace: AiDocsRoot = {
  name: 'repo', dirPath: repo, isUser: false, truncated: false,
  groups: [
    { key: 'instructions', title: 'Instructions', rows: [agents] },
    { key: 'rule', title: 'Rules', rows: [webRule] },
    { key: 'skill', title: 'Skills', rows: [deploy] },
  ],
};
const user: AiDocsRoot = {
  name: 'User', dirPath: path.join(path.sep, 'home', 'me'), isUser: true, truncated: false,
  groups: [{ key: 'skill', title: 'Skills', rows: [doc({ name: 'Tidy', displayPath: '.claude/skills/tidy/SKILL.md', docType: 'skill' })] }],
};

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<div id="tree">${html}</div>`, 'text/html');
}

const openView = path.join(repo, 'src', 'webview', 'view.ts');
const noFile = { activePaths: [] };

describe('aiDocsTreeHtml', () => {
  test('makes each group a folder at the top level when there is one root', () => {
    const page = parse(aiDocsTreeHtml([workspace], noFile));
    const nodes = Array.from(page.querySelectorAll('.node'));
    expect(nodes.map(node => [node.querySelector('.node-title')?.textContent, node.getAttribute('aria-level'), node.querySelector('.count')?.textContent]))
      .toEqual([['Instructions', '1', '1'], ['Rules', '1', '1'], ['Skills', '1', '1']]);
    expect(page.querySelector('.doc-row')?.getAttribute('aria-level')).toBe('2');
  });

  test('gives each root its own folder when more than one has docs', () => {
    const page = parse(aiDocsTreeHtml([workspace, user], noFile));
    const top = Array.from(page.querySelectorAll('#tree > .node'));
    expect(top.map(node => [node.querySelector(':scope > .node-row .node-title')?.textContent, node.querySelector(':scope > .node-row .count')?.textContent]))
      .toEqual([['repo', '3'], ['User', '1']]);
    expect(top[1].querySelector('.codicon-account')).not.toBeNull();
    expect(page.querySelector('.doc-row')?.getAttribute('aria-level')).toBe('3');
  });

  test('leaves out a root with no docs, and renders nothing when none has any', () => {
    const empty: AiDocsRoot = { ...user, groups: [] };
    expect(parse(aiDocsTreeHtml([workspace, empty], noFile)).querySelectorAll('#tree > .node').length).toBe(3);
    expect(aiDocsTreeHtml([empty], noFile)).toBe('');
  });

  test('follows the tree pattern: tree items, with children in a group', () => {
    const page = parse(aiDocsTreeHtml([workspace], noFile));
    for (const item of Array.from(page.querySelectorAll('.node, .doc-row'))) {
      expect(item.getAttribute('role')).toBe('treeitem');
      expect(item.getAttribute('tabindex')).toBe('-1');
    }
    expect(page.querySelector('.node')?.getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.node > .children')?.getAttribute('role')).toBe('group');
  });

  test('shows a row\'s name, hint, scope and problems, with the details as hover text', () => {
    const page = parse(aiDocsTreeHtml([workspace], noFile));
    const rows = Array.from(page.querySelectorAll<HTMLElement>('.doc-row'));
    expect(rows[0].querySelector('.row-name')?.textContent).toBe('Agents');
    expect(rows[0].querySelector('.row-hint')?.textContent).toBe('workspace root');
    expect(rows[0].querySelector('.codicon-robot')).not.toBeNull();
    expect(rows[1].querySelector('.scope-chip')?.textContent).toBe('src/webview/** +1');
    expect(rows[2].querySelector('.issue-mark')?.getAttribute('aria-label')).toBe('Has a problem');
    expect(rows[2].getAttribute('title')).toBe('.agents/skills/deploy/SKILL.md');
  });

  test('carries the file to open and the text the filter searches, escaped', () => {
    const page = parse(aiDocsTreeHtml([workspace], noFile));
    const row = Array.from(page.querySelectorAll<HTMLElement>('.doc-row'))[2];
    expect(row.dataset.itemPath).toBe(deploy.filePath);
    expect(row.dataset.filter).toBe('deploy ships the <app> .agents/skills/deploy/skill.md');
    expect(aiDocsTreeHtml([workspace], noFile)).not.toContain('<app>');
  });

  test('marks the docs that apply to the open file, and only gives a mark to docs that can', () => {
    const page = parse(aiDocsTreeHtml([workspace], { openFile: openView, activePaths: [comparablePath(openView)] }));
    const rows = Array.from(page.querySelectorAll<HTMLElement>('.doc-row'));
    expect(rows.map(row => row.dataset.applies)).toEqual(['true', 'true', undefined]);
    expect(rows.map(row => row.querySelector('.applies-mark') !== null)).toEqual([true, true, false]);
  });

  test('does not mark a scoped rule the open file is outside of', () => {
    const page = parse(aiDocsTreeHtml([workspace], { openFile: path.join(repo, 'docs', 'guide.md'), activePaths: [] }));
    const rows = Array.from(page.querySelectorAll<HTMLElement>('.doc-row'));
    expect(rows.map(row => row.dataset.applies)).toEqual(['true', undefined, undefined]);
  });

  test('highlights the row of the open file', () => {
    const page = parse(aiDocsTreeHtml([workspace], { openFile: agents.filePath, activePaths: [comparablePath(agents.filePath)] }));
    expect(page.querySelector('[data-active="true"] .row-name')?.textContent).toBe('Agents');
  });

  test('says so when a folder was too large to look through', () => {
    expect(aiDocsTreeHtml([{ ...workspace, truncated: true }], noFile)).toContain('too large to look through completely');
  });
});

describe('appliesPaths', () => {
  test('lists the rows that apply, in the form the page matches them by', () => {
    expect(appliesPaths([workspace, user], openView)).toEqual([comparablePath(agents.filePath), comparablePath(webRule.filePath)]);
    expect(appliesPaths([workspace], undefined)).toEqual([]);
  });
});
