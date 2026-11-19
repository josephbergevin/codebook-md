import {
  commands, Disposable, ExtensionContext, Uri, ViewColumn, Webview, WebviewPanel, window, workspace,
} from 'vscode';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as config from '../config';
import * as sideBarSettings from '../sideBarSettings';
import { escapeHtml } from './notebooksViewHtml';

/**
 * The Side Bar Settings panel: an editor tab that lists the groups of the My
 * Notebooks view and the AI Docs view, with the options of whichever is
 * selected.
 *
 * Changes are written as they are made. The side bar redraws from the same
 * stores, so it serves as the preview. The page renders itself from a state
 * object; after every change, and whenever the settings or codebook-md.json
 * change elsewhere, the state is sent again.
 */

export interface SideBarSettingsOptions {
  // The group to show first: `related`, `group:<index>` or `aiDocs`
  selectId?: string;
  // Called after codebook-md.json was written, so the side bar can redraw
  onGroupsChanged?: () => void;
}

let currentPanel: WebviewPanel | undefined;
let currentScope: sideBarSettings.SettingScope = 'workspace';
let groupsChanged: (() => void) | undefined;

/** isSideBarSettingsOpen reports whether the panel is open. */
export function isSideBarSettingsOpen(): boolean {
  return currentPanel !== undefined;
}

/**
 * offerReload tells the user that a setting cannot be saved until the window
 * is reloaded, and reloads it when they choose to.
 */
export async function offerReload(): Promise<void> {
  const reload = 'Reload Window';
  const choice = await window.showWarningMessage(
    'CodebookMD was updated. Reload the window to finish; this setting can be changed after that.', reload
  );
  if (choice === reload) {
    await commands.executeCommand('workbench.action.reloadWindow');
  }
}

function postState(saved = false): void {
  currentPanel?.webview.postMessage({ command: 'state', state: sideBarSettings.sideBarState(currentScope), saved });
}

/**
 * handleSideBarSettingsMessage acts on one message from the page. Every value
 * is checked by sideBarSettings before it is written.
 */
export async function handleSideBarSettingsMessage(message: Record<string, unknown>): Promise<void> {
  if (!message || typeof message.command !== 'string') {
    return;
  }
  const configPath = config.getCodebookConfigFilePath();
  try {
    switch (message.command) {
      case 'setScope':
        if (message.scope === 'workspace' || message.scope === 'user') {
          currentScope = message.scope;
        }
        postState();
        break;
      case 'setSetting': {
        const saved = await sideBarSettings.writeSetting(message.key, message.value, currentScope);
        postState(saved);
        break;
      }
      case 'resetSetting': {
        const saved = await sideBarSettings.resetSetting(message.key, currentScope);
        postState(saved);
        break;
      }
      case 'updateGroup': {
        const saved = sideBarSettings.updateFolderGroup(configPath, message.index, message.patch);
        if (saved) {
          groupsChanged?.();
        }
        postState(saved);
        break;
      }
      case 'setOrder': {
        const saved = await sideBarSettings.applyGroupOrder(configPath, message.order, currentScope);
        if (saved) {
          groupsChanged?.();
        }
        postState(saved);
        break;
      }
      case 'openSetting':
        if (typeof message.key === 'string' && /^[A-Za-z][\w.]*$/.test(message.key)) {
          await commands.executeCommand('workbench.action.openSettings', `codebook-md.${message.key}`);
        }
        break;
      case 'openConfigFile':
        if (configPath && fs.existsSync(configPath)) {
          await commands.executeCommand('vscode.open', Uri.file(configPath));
        }
        break;
      case 'reloadWindow':
        // The button in the notice shown while settings wait for a reload
        await commands.executeCommand('workbench.action.reloadWindow');
        break;
    }
  } catch (error) {
    if (error instanceof sideBarSettings.ReloadNeededError) {
      // Nothing was written; show what is stored and say what will fix it
      postState();
      void offerReload();
      return;
    }
    console.error('Side Bar Settings: could not apply the change:', error);
    window.showErrorMessage(`Codebook: could not save the setting - ${error instanceof Error ? error.message : error}`);
    // Show what is really stored, not what the page tried to set
    postState();
  }
}

/**
 * renderSideBarSettingsHtml fills the panel's template.
 * @param template the contents of sideBarSettings.html
 */
export function renderSideBarSettingsHtml(
  template: string, state: sideBarSettings.SideBarState, selectId: string, nonce: string, cspSource: string, codiconsCssUri: string
): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  // The state sits in a script element as JSON; `<` is written as an escape so
  // no value can close the element
  const pageData = JSON.stringify({ state, selectId }).replace(/</g, '\\u003c');

  // Replacer functions keep `$` sequences in names from being read as patterns
  return template
    .replace('{{csp}}', () => escapeHtml(csp))
    .replace('{{codiconsCssUri}}', () => escapeHtml(codiconsCssUri))
    .replace(/\{\{nonce\}\}/g, () => escapeHtml(nonce))
    .replace('{{pageData}}', () => pageData);
}

function panelHtml(webview: Webview, extensionPath: string, selectId: string): string {
  const template = fs.readFileSync(path.join(extensionPath, 'dist', 'templates', 'sideBarSettings.html'), 'utf8');
  const codiconsCssUri = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'dist', 'codicons', 'codicon.css'))).toString();
  const nonce = randomBytes(16).toString('base64');
  return renderSideBarSettingsHtml(
    template, sideBarSettings.sideBarState(currentScope), selectId, nonce, webview.cspSource, codiconsCssUri
  );
}

/**
 * openSideBarSettingsPanel opens the panel, or brings it forward when it is
 * already open.
 */
export function openSideBarSettingsPanel(context: ExtensionContext, options: SideBarSettingsOptions = {}): void {
  groupsChanged = options.onGroupsChanged ?? groupsChanged;
  const selectId = options.selectId ?? '';

  if (currentPanel) {
    currentPanel.reveal();
    if (selectId) {
      currentPanel.webview.postMessage({ command: 'select', id: selectId });
    }
    return;
  }

  currentScope = sideBarSettings.defaultScope();
  const panel = window.createWebviewPanel(
    'codebookSideBarSettings',
    'Side Bar Settings',
    ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: [Uri.file(path.join(context.extensionPath, 'dist', 'codicons'))],
      retainContextWhenHidden: true,
    }
  );
  currentPanel = panel;
  panel.webview.html = panelHtml(panel.webview, context.extensionPath, selectId || sideBarSettings.relatedGroupId);

  const disposables: Disposable[] = [];
  panel.webview.onDidReceiveMessage(message => handleSideBarSettingsMessage(message), undefined, disposables);

  // Settings changed elsewhere - a drawer, settings.json, the Settings UI
  disposables.push(workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('codebook-md.dynamicFolderGroup') || event.affectsConfiguration('codebook-md.aiDocs')) {
      postState();
    }
  }));
  disposables.push(workspace.onDidChangeWorkspaceFolders(() => postState()));

  // Folder groups added, renamed or reordered from the side bar or by hand
  const configWatcher = workspace.createFileSystemWatcher('**/.vscode/codebook-md.json');
  configWatcher.onDidChange(() => postState());
  configWatcher.onDidCreate(() => postState());
  configWatcher.onDidDelete(() => postState());
  disposables.push(configWatcher);

  panel.onDidDispose(() => {
    currentPanel = undefined;
    disposables.forEach(disposable => disposable.dispose());
  }, undefined, disposables);
  context.subscriptions.push(panel);
}

/** refreshSideBarSettingsPanel sends the panel the current state, when it is open. */
export function refreshSideBarSettingsPanel(): void {
  postState();
}
