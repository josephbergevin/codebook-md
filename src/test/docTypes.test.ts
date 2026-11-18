import { classifyDocPath, docTypeInfo, docTypes, isMarkdownFileName, prettifyName } from '../docTypes';

describe('classifyDocPath', () => {
  const cases: [string, string][] = [
    ['.agents/skills/docker-cleanup/SKILL.md', 'skill'],
    ['.claude/skills/x/skill.md', 'skill'],
    ['AGENTS.md', 'instructions'],
    ['extractor/CLAUDE.md', 'instructions'],
    ['GEMINI.md', 'instructions'],
    ['.github/copilot-instructions.md', 'instructions'],
    ['.github/instructions/extractor.instructions.md', 'rule'],
    ['.claude/rules/testing.md', 'rule'],
    ['.kiro/steering/product.md', 'rule'],
    ['.clinerules/style.md', 'rule'],
    ['.github/prompts/release.prompt.md', 'prompt'],
    ['.claude/commands/git/commit.md', 'prompt'],
    ['.agent/workflows/deploy.md', 'prompt'],
    ['.claude/agents/reviewer.md', 'agent'],
    ['.github/agents/planner.agent.md', 'agent'],
    ['.github/chatmodes/ask.chatmode.md', 'agent'],
    ['README.md', 'readme'],
    ['docs/readme.zh-cn.md', 'readme'],
    ['CHANGELOG.md', 'changelog'],
    ['extractor/CHANGELOG-dev.md', 'changelog'],
    ['LICENSE.md', 'license'],
    ['CONTRIBUTING.md', 'policy'],
    ['SECURITY.md', 'policy'],
    ['CODE_OF_CONDUCT.md', 'policy'],
    ['docs/guide.md', 'markdown'],
    ['.agents/references/architecture.md', 'markdown'],
  ];

  test.each(cases)('%s is a %s', (filePath, expected) => {
    expect(classifyDocPath(filePath)).toBe(expected);
  });

  test('a file name wins over the folder it sits in', () => {
    expect(classifyDocPath('.claude/rules/README.md')).toBe('readme');
  });

  test('reads Windows separators', () => {
    expect(classifyDocPath('C:\\repo\\.claude\\rules\\testing.md')).toBe('rule');
  });

  test('a name that only starts like a known file is plain markdown', () => {
    expect(classifyDocPath('agents-overview.md')).toBe('markdown');
  });
});

describe('docTypeInfo', () => {
  test('every type has an icon and a label', () => {
    for (const info of docTypes) {
      expect(info.icon).toMatch(/^[a-z-]+$/);
      expect(info.label).not.toBe('');
    }
  });

  test('marks the agent-related types', () => {
    expect(docTypes.filter(info => info.isAgentDoc).map(info => info.id))
      .toEqual(['instructions', 'rule', 'skill', 'prompt', 'agent']);
  });

  test('returns the markdown entry for the default type', () => {
    expect(docTypeInfo('markdown').icon).toBe('markdown');
  });
});

describe('isMarkdownFileName', () => {
  test('accepts .md and .markdown in any case', () => {
    expect(isMarkdownFileName('a.MD')).toBe(true);
    expect(isMarkdownFileName('a.markdown')).toBe(true);
  });

  test('rejects other extensions', () => {
    expect(isMarkdownFileName('a.mdc')).toBe(false);
  });
});

describe('prettifyName', () => {
  test('turns a hyphenated name into a title', () => {
    expect(prettifyName('docker-cleanup')).toBe('Docker Cleanup');
  });

  test('splits on underscores too', () => {
    expect(prettifyName('pr_watch-and-merge')).toBe('Pr Watch And Merge');
  });

  test('leaves text that already has spaces alone', () => {
    expect(prettifyName('My custom agent')).toBe('My custom agent');
  });
});
