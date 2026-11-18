/**
 * The kinds of markdown document the side bar tells apart, and where the
 * agent-related ones live on disk.
 *
 * Everything here works on paths alone - no file is read. The types and
 * locations are plain data so a later setting can extend them.
 */

export type DocType =
  | 'readme'
  | 'changelog'
  | 'license'
  | 'policy'
  | 'instructions'
  | 'rule'
  | 'skill'
  | 'prompt'
  | 'agent'
  | 'notebook'
  | 'markdown';

export interface DocTypeInfo {
  id: DocType;
  // Shown in tooltips, e.g. "Skill"
  label: string;
  // Codicon name, without the `codicon-` prefix
  icon: string;
  // Written for or about coding agents
  isAgentDoc: boolean;
}

export const docTypes: DocTypeInfo[] = [
  { id: 'readme', label: 'README', icon: 'book', isAgentDoc: false },
  { id: 'changelog', label: 'Changelog', icon: 'history', isAgentDoc: false },
  { id: 'license', label: 'License', icon: 'law', isAgentDoc: false },
  { id: 'policy', label: 'Project policy', icon: 'shield', isAgentDoc: false },
  { id: 'instructions', label: 'Agent instructions', icon: 'robot', isAgentDoc: true },
  { id: 'rule', label: 'Scoped rule', icon: 'target', isAgentDoc: true },
  { id: 'skill', label: 'Skill', icon: 'mortar-board', isAgentDoc: true },
  { id: 'prompt', label: 'Prompt', icon: 'terminal', isAgentDoc: true },
  { id: 'agent', label: 'Agent definition', icon: 'hubot', isAgentDoc: true },
  { id: 'notebook', label: 'Runnable notebook', icon: 'notebook', isAgentDoc: false },
  { id: 'markdown', label: 'Markdown', icon: 'markdown', isAgentDoc: false },
];

const docTypesById = new Map<DocType, DocTypeInfo>(docTypes.map(info => [info.id, info]));

/** docTypeInfo returns the label and icon for a doc type. */
export function docTypeInfo(type: DocType): DocTypeInfo {
  return docTypesById.get(type) ?? docTypes[docTypes.length - 1];
}

/** isMarkdownFileName reports whether a file name has a markdown extension. */
export function isMarkdownFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** The file name every Agent Skill is defined in. */
export const skillFileName = 'SKILL.md';

interface PathRule {
  type: DocType;
  // Tested against the lower-cased base name
  name?: RegExp;
  // Tested against the lower-cased path with forward slashes
  path?: RegExp;
}

// First match wins. A file's own name says more than the folder it sits in, so
// the name rules come before the folder rules.
const pathRules: PathRule[] = [
  { type: 'skill', name: /^skill\.md$/ },
  { type: 'rule', name: /\.instructions\.md$/ },
  { type: 'prompt', name: /\.prompt\.md$/ },
  { type: 'agent', name: /\.(agent|chatmode)\.md$/ },
  { type: 'instructions', name: /^(agents?|claude|claude\.local|gemini|copilot-instructions)\.md$/ },
  { type: 'readme', name: /^readme(\.[\w-]+)?\.(md|markdown)$/ },
  { type: 'changelog', name: /^(changelog|changes|history|release[-_ ]?notes|releases)([-_. ][\w.-]+)?\.(md|markdown)$/ },
  { type: 'license', name: /^(license|licence|copying|notice)([-_. ][\w.-]+)?\.(md|markdown)$/ },
  { type: 'policy', name: /^(contributing|security|code[-_ ]of[-_ ]conduct|governance|support)\.(md|markdown)$/ },
  { type: 'rule', path: /(^|\/)(\.claude\/rules|\.windsurf\/rules|\.kiro\/steering|\.continue\/rules|\.clinerules|\.agent\/rules|\.github\/instructions)\// },
  { type: 'prompt', path: /(^|\/)(\.claude\/commands|\.agent\/workflows|\.github\/prompts)\// },
  { type: 'agent', path: /(^|\/)(\.claude\/agents|\.github\/agents|\.github\/chatmodes)\// },
];

/**
 * classifyDocPath works out a markdown file's type from its path.
 *
 * Returns 'markdown' when nothing more specific applies; whether such a file
 * is a runnable notebook depends on its content, which docMeta checks.
 */
export function classifyDocPath(filePath: string): DocType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
  for (const rule of pathRules) {
    if (rule.name ? rule.name.test(baseName) : rule.path?.test(normalized)) {
      return rule.type;
    }
  }
  return 'markdown';
}

/**
 * Where agent docs of one type are kept, relative to a folder that may hold
 * them (a repository root, or any folder with its own agent setup).
 */
export interface AgentDocLocation {
  type: DocType;
  // Folder to look in, or the file itself when `file` is true
  path: string;
  // The location is a single file rather than a folder
  file?: boolean;
  // Look in nested folders too
  recursive?: boolean;
  // Only files whose lower-cased name ends with this
  suffix?: string;
}

/** Folders whose sub-folders are skills, each defined by a SKILL.md. */
export const skillRoots: string[] = ['.agents/skills', '.agent/skills', '.claude/skills', '.github/skills'];

export const agentDocLocations: AgentDocLocation[] = [
  { type: 'instructions', path: '.github/copilot-instructions.md', file: true },
  { type: 'instructions', path: '.claude/CLAUDE.md', file: true },
  { type: 'rule', path: '.github/instructions', recursive: true, suffix: '.instructions.md' },
  { type: 'rule', path: '.claude/rules', recursive: true },
  { type: 'rule', path: '.windsurf/rules' },
  { type: 'rule', path: '.kiro/steering' },
  { type: 'rule', path: '.continue/rules' },
  { type: 'rule', path: '.clinerules' },
  { type: 'rule', path: '.agent/rules' },
  { type: 'prompt', path: '.github/prompts', suffix: '.prompt.md' },
  { type: 'prompt', path: '.claude/commands', recursive: true },
  { type: 'prompt', path: '.agent/workflows' },
  { type: 'agent', path: '.claude/agents' },
  { type: 'agent', path: '.github/agents' },
  { type: 'agent', path: '.github/chatmodes', suffix: '.chatmode.md' },
];

/**
 * Folders that belong to agent tooling as a whole. Markdown under them that
 * no location above claims is listed as an agent reference doc.
 */
export const agentDocRoots: string[] = ['.agents', '.agent', '.claude'];

/** Titles of the folders agent docs are grouped into in the tree. */
export const agentDocGroupNames: Record<'skill' | 'rule' | 'prompt' | 'agent' | 'reference', string> = {
  skill: 'Skills',
  rule: 'Rules',
  prompt: 'Prompts',
  agent: 'Agent Definitions',
  reference: 'Agent References',
};

/**
 * prettifyName turns an identifier such as `docker-cleanup` into a title,
 * `Docker Cleanup`. Text that already has spaces is returned as written.
 */
export function prettifyName(name: string): string {
  const trimmed = name.trim();
  if (/\s/.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
