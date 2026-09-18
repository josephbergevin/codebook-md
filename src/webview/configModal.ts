import {
  window, WebviewPanel, ViewColumn, Uri, ExtensionContext, env, commands, NotebookCell,
  NotebookDocument, workspace, ConfigurationTarget, Disposable,
} from 'vscode';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as codebook from '../codebook';
import { getCellConfig } from '../codebook';
import { saveCellConfig, getHistoryForCell, clearHistoryForCell, deleteHistoryEntry } from '../cellConfig';
import { applyFieldOverrides, buildConfigFields } from './cellConfigFields';
import { ModalRenderParams, renderConfigModalHtml } from './configModalHtml';

/**
 * Updates or adds front matter to markdown content
 * @param content The current markdown content
 * @param frontMatter The new front matter content (without --- delimiters)
 * @returns Updated markdown content with front matter
 */
function updateFrontMatterInMarkdown(content: string, frontMatter: string): string {
  const lines = content.split(/\r?\n/);
  const trimmedFrontMatter = frontMatter.trim();

  // Check if there's existing front matter
  let hasFrontMatter = false;
  let frontMatterEndIndex = 0;

  if (lines.length > 0 && lines[0].trim() === '---') {
    // Look for closing --- marker
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        hasFrontMatter = true;
        frontMatterEndIndex = i + 1;
        break;
      }
    }
  }

  if (trimmedFrontMatter === '') {
    // Remove front matter if empty
    if (hasFrontMatter) {
      // Remove the front matter section
      const remainingContent = lines.slice(frontMatterEndIndex).join('\n');
      return remainingContent.replace(/^\n+/, ''); // Remove leading newlines
    }
    // No front matter to remove
    return content;
  }

  // Add or update front matter
  const frontMatterLines = [
    '---',
    ...trimmedFrontMatter.split('\n'),
    '---'
  ];

  if (hasFrontMatter) {
    // Replace existing front matter
    const remainingContent = lines.slice(frontMatterEndIndex);
    return [...frontMatterLines, '', ...remainingContent].join('\n');
  } else {
    // Add new front matter at the beginning
    return [...frontMatterLines, '', ...lines].join('\n');
  }
}

/**
 * Extracts front matter content from markdown
 * @param content The markdown content
 * @returns The front matter content without --- delimiters, or empty string if none
 */
function extractFrontMatterFromMarkdown(content: string): string {
  const lines = content.split(/\r?\n/);

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return '';
  }

  // Look for closing --- marker
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      // Found closing marker, extract content
      return lines.slice(1, i).join('\n');
    }
  }

  // No closing marker found
  return '';
}

// ---------------------------------------------------------------------------
// Modal state
// ---------------------------------------------------------------------------

// ModalTarget is what the modal is showing: one code cell, or (for a markdown
// cell or the notebook toolbar) just the notebook-level settings
interface ModalTarget {
  execCell: codebook.ExecutableCell | null;
  notebookCell?: NotebookCell;
  notebook?: NotebookDocument;
}

let currentPanel: WebviewPanel | undefined = undefined;
let currentTarget: ModalTarget | undefined = undefined;
// dirty is reported by the page: the shown cell has unsaved edits
let dirty = false;
// pendingTarget is a cell selected while the shown cell had unsaved edits
let pendingTarget: ModalTarget | undefined = undefined;
// extensionUri locates the codicon stylesheet shipped in dist/codicons
let extensionUri: Uri | undefined = undefined;

// Settings the page may change directly (the execution history controls)
const updatableSettings = new Set(['executionHistory.enabled', 'executionHistory.historyLimit']);

export function isConfigModalOpen(): boolean {
  return currentPanel !== undefined;
}

/**
 * Notifies the config modal webview that execution history has been updated
 * This triggers an auto-refresh of the history display
 */
export function notifyHistoryUpdated(): void {
  currentPanel?.webview.postMessage({ command: 'historyUpdated' });
}

export async function updateConfigModalForCell(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell): Promise<void> {
  if (currentPanel) {
    showTarget({ execCell, notebookCell });
  }
}

export async function updateConfigModalForNotebook(notebook: NotebookDocument): Promise<void> {
  if (currentPanel) {
    showTarget({ execCell: null, notebook });
  }
}

export async function openConfigModal(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell, context?: ExtensionContext): Promise<void> {
  openPanel(context);
  showTarget({ execCell, notebookCell });
}

export async function openNotebookConfigModal(execCell: codebook.ExecutableCell | null, notebook: NotebookDocument, context?: ExtensionContext): Promise<void> {
  openPanel(context);
  showTarget({ execCell: null, notebook });
}

// isCodeCellTarget reports whether a target shows a code cell's settings
function isCodeCellTarget(target: ModalTarget | undefined): target is ModalTarget & { notebookCell: NotebookCell; execCell: codebook.ExecutableCell; } {
  return !!target?.notebookCell && !!target.execCell && target.notebookCell.document.languageId !== 'markdown';
}

function targetKey(target: ModalTarget | undefined): string {
  if (isCodeCellTarget(target)) {
    return `cell:${target.notebookCell.document.uri.toString()}`;
  }
  const notebook = target?.notebook ?? target?.notebookCell?.notebook;
  return `notebook:${notebook?.uri.toString() ?? ''}`;
}

/**
 * showTarget renders a cell (or notebook) in the modal - unless the cell shown
 * now has unsaved edits, in which case the new target waits until the user
 * saves or discards them.
 */
function showTarget(target: ModalTarget): void {
  if (!currentPanel) {
    return;
  }
  if (dirty && targetKey(target) !== targetKey(currentTarget)) {
    pendingTarget = target;
    currentPanel.webview.postMessage({ command: 'pendingSelection' });
    return;
  }
  if (dirty) {
    return; // same cell - keep the edits on screen
  }
  render(target);
}

function render(target: ModalTarget, options: { justSaved?: boolean; } = {}): void {
  if (!currentPanel) {
    return;
  }
  currentTarget = target;
  pendingTarget = undefined;
  dirty = false;

  const panel = currentPanel;
  const nonce = randomBytes(16).toString('base64');
  const notebook = target.notebook ?? target.notebookCell?.notebook;

  let frontMatter = '';
  if (notebook) {
    try {
      frontMatter = extractFrontMatterFromMarkdown(fs.readFileSync(notebook.uri.fsPath, 'utf8'));
    } catch (error) {
      console.error('Error reading front matter:', error);
    }
  }

  const historyConfig = workspace.getConfiguration('codebook-md.executionHistory');
  const params: ModalRenderParams = {
    cspSource: panel.webview.cspSource,
    nonce,
    codiconsCssUri: extensionUri
      ? panel.webview.asWebviewUri(Uri.joinPath(extensionUri, 'dist', 'codicons', 'codicon.css')).toString()
      : undefined,
    justSaved: options.justSaved,
    notebookUri: notebook?.uri.toString(),
    frontMatter,
    fields: [],
    cellCommands: [],
    availableCommands: [],
    history: {
      enabled: historyConfig.get<boolean>('enabled', true),
      historyLimit: historyConfig.get<number>('historyLimit', 10),
      target: settingsTarget() === ConfigurationTarget.Workspace ? 'workspace' : 'user',
    },
  };

  if (isCodeCellTarget(target)) {
    const cell = target.notebookCell;
    const blockConfig = target.execCell.codeBlockConfig();
    const commentPrefix = target.execCell.defaultCommentPrefix() || '//';
    params.cell = { uri: cell.document.uri.toString(), index: cell.index, languageId: cell.document.languageId };
    params.fields = buildConfigFields(cell.document.languageId, getCellConfig(cell));
    params.cellCommands = blockConfig.commands.map(cmd => `${commentPrefix} [>]${cmd}`);
    params.availableCommands = blockConfig.availableCommands().map(cmd => `${commentPrefix} [>]${cmd}`);
    panel.title = `Cell ${cell.index + 1} Config (${cell.document.languageId})`;
  } else {
    panel.title = 'Notebook Configuration';
  }

  panel.webview.html = renderConfigModalHtml(params);
}

// settingsTarget is where the history controls write: the workspace when one is
// open, otherwise the user settings
function settingsTarget(): ConfigurationTarget {
  return workspace.workspaceFolders?.length ? ConfigurationTarget.Workspace : ConfigurationTarget.Global;
}

// ---------------------------------------------------------------------------
// Panel and messages
// ---------------------------------------------------------------------------

function openPanel(context?: ExtensionContext): void {
  extensionUri = context?.extensionUri ?? extensionUri;
  // Open next to the notebook, keeping focus on it
  const activeColumn = window.activeNotebookEditor?.viewColumn ?? window.activeTextEditor?.viewColumn ?? ViewColumn.One;
  const modalColumn = activeColumn >= ViewColumn.Three ? ViewColumn.One : (activeColumn + 1) as ViewColumn;

  if (currentPanel) {
    currentPanel.reveal(modalColumn, true);
    return;
  }

  const panel = window.createWebviewPanel(
    'codeBlockConfig',
    'Code Block Config',
    { viewColumn: modalColumn, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: extensionUri ? [Uri.joinPath(extensionUri, 'dist', 'codicons')] : [],
      retainContextWhenHidden: true,
    }
  );
  currentPanel = panel;

  const disposables: Disposable[] = [];
  panel.webview.onDidReceiveMessage(message => handleMessage(message), undefined, disposables);
  panel.onDidDispose(() => {
    currentPanel = undefined;
    currentTarget = undefined;
    pendingTarget = undefined;
    dirty = false;
    disposables.forEach(d => d.dispose());
  }, undefined, disposables);
  context?.subscriptions.push(panel);
}

// resolveCell finds a notebook cell by its document URI, so a message still
// reaches the right cell after cells have been inserted, deleted or moved
async function resolveCell(notebookUri: unknown, cellUri: unknown): Promise<NotebookCell | undefined> {
  if (typeof notebookUri !== 'string' || typeof cellUri !== 'string') {
    return undefined;
  }
  const notebook = workspace.notebookDocuments.find(nb => nb.uri.toString() === notebookUri)
    ?? await workspace.openNotebookDocument(Uri.parse(notebookUri));
  return notebook.getCells().find(cell => cell.document.uri.toString() === cellUri);
}

async function handleMessage(message: Record<string, unknown>): Promise<void> {
  if (!message || typeof message.command !== 'string') {
    return;
  }
  try {
    switch (message.command) {
      case 'dirtyChanged':
        dirty = message.dirty === true;
        return;

      case 'discardChanges':
        dirty = false;
        render(pendingTarget ?? currentTarget ?? { execCell: null });
        return;

      case 'close':
        currentPanel?.dispose();
        return;

      case 'saveConfig':
        await saveConfig(message);
        return;

      case 'saveFrontMatter': {
        if (typeof message.notebookUri !== 'string' || typeof message.frontMatter !== 'string') {
          window.showErrorMessage('Codebook: no notebook to save the front matter to.');
          return;
        }
        const filePath = Uri.parse(message.notebookUri).fsPath;
        const updated = updateFrontMatterInMarkdown(fs.readFileSync(filePath, 'utf8'), message.frontMatter);
        fs.writeFileSync(filePath, updated, 'utf8');
        window.showInformationMessage('Front matter updated');
        return;
      }

      case 'openSpecificSetting':
        if (typeof message.settingId === 'string' && message.settingId.startsWith('codebook-md.')) {
          commands.executeCommand('workbench.action.openSettings', message.settingId);
        }
        return;

      case 'openSettings':
        commands.executeCommand('workbench.action.openSettings', 'codebook-md');
        return;

      case 'openDocumentation':
        if (typeof message.section === 'string') {
          commands.executeCommand('codebook-md.openDocumentation', message.section);
        }
        return;

      case 'copyToClipboard':
        if (typeof message.text === 'string') {
          await env.clipboard.writeText(message.text);
          window.setStatusBarMessage('Copied to clipboard', 2000);
        }
        return;

      case 'updateWorkspaceSetting': {
        if (typeof message.key !== 'string' || !updatableSettings.has(message.key)) {
          return;
        }
        await workspace.getConfiguration('codebook-md').update(message.key, message.value, settingsTarget());
        return;
      }

      case 'loadHistory':
      case 'loadHistoryCount':
      case 'clearHistory':
      case 'deleteHistoryEntry':
        await handleHistoryMessage(message);
        return;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`config modal: '${message.command}' failed:`, error);
    window.showErrorMessage(`Codebook: ${errorMessage}`);
  }
}

async function saveConfig(message: Record<string, unknown>): Promise<void> {
  const cell = await resolveCell(message.notebookUri, message.cellUri);
  if (!cell) {
    window.showErrorMessage('Codebook: could not save - the cell no longer exists.');
    return;
  }
  if (cell.document.languageId !== message.languageId) {
    window.showErrorMessage(`Codebook: could not save - the cell's language changed to ${cell.document.languageId}. Reopen its configuration.`);
    return;
  }
  const overrides = message.overrides && typeof message.overrides === 'object'
    ? message.overrides as Record<string, unknown>
    : {};

  // Build from the config on disk now, not when the modal opened - cell runs
  // may have added history entries since
  const existing = getCellConfig(cell) as Record<string, unknown> | null;
  const fields = buildConfigFields(cell.document.languageId, existing);
  const config = applyFieldOverrides(existing, fields, overrides);

  if (!await saveCellConfig(cell, config)) {
    window.showErrorMessage('Codebook: failed to save the cell configuration. See the log for details.');
    return;
  }
  const count = Object.keys(overrides).length;
  window.setStatusBarMessage(`Cell ${cell.index + 1} configuration saved (${count} override${count === 1 ? '' : 's'})`, 3000);

  dirty = false;
  if (pendingTarget) {
    render(pendingTarget);
  } else if (isCodeCellTarget(currentTarget) && currentTarget.notebookCell.document.uri.toString() === cell.document.uri.toString()) {
    render({ execCell: currentTarget.execCell, notebookCell: cell }, { justSaved: true });
  }
}

async function handleHistoryMessage(message: Record<string, unknown>): Promise<void> {
  const cell = await resolveCell(message.notebookUri, message.cellUri);
  if (!cell) {
    return;
  }
  const uri = cell.notebook.uri;
  const post = (data: Record<string, unknown>) => currentPanel?.webview.postMessage(data);

  switch (message.command) {
    case 'loadHistory':
      post({ command: 'historyLoaded', history: getHistoryForCell(uri, cell.index) });
      return;
    case 'loadHistoryCount':
      post({ command: 'historyCountLoaded', count: getHistoryForCell(uri, cell.index).length });
      return;
    case 'clearHistory': {
      // Webviews can't show confirm() dialogs, so confirm here
      const choice = await window.showWarningMessage(
        `Clear all execution history for cell ${cell.index + 1}?`, { modal: true }, 'Clear');
      if (choice !== 'Clear') {
        return;
      }
      if (clearHistoryForCell(uri, cell.index)) {
        post({ command: 'historyCleared' });
      } else {
        window.showErrorMessage('Codebook: failed to clear the execution history.');
      }
      return;
    }
    case 'deleteHistoryEntry': {
      if (typeof message.entryId !== 'string') {
        return;
      }
      if (deleteHistoryEntry(uri, cell.index, message.entryId)) {
        post({ command: 'historyLoaded', history: getHistoryForCell(uri, cell.index) });
      } else {
        window.showErrorMessage('Codebook: failed to delete the history entry.');
      }
      return;
    }
  }
}

// Export functions for testing
export const __test__ = {
  updateFrontMatterInMarkdown,
  extractFrontMatterFromMarkdown,
  handleMessage,
  resetState: (): void => {
    currentPanel = undefined;
    currentTarget = undefined;
    pendingTarget = undefined;
    dirty = false;
  },
};
