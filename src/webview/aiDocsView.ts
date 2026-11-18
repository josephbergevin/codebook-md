import {
  WebviewView, WebviewViewProvider, ExtensionContext, Uri, Disposable, commands, workspace, window,
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AiDocsRoot, AiDocsRootSpec, countAiDocs, scanAiDocs, userDocsRoot } from '../aiDocs';
import * as config from '../config';
import { clearDocMetaCache } from '../docMeta';
import { isMarkdownFileName } from '../docTypes';
import { activeFilePath, activeFilePaths, samePaths } from './activeFile';
import { aiDocsTreeHtml, appliesPaths } from './aiDocsViewHtml';
import { escapeHtml } from './notebooksViewHtml';

// Set while the workspace has agent docs; the view's `when` clause reads it
export const hasAgentDocsContextKey = 'codebook-md.hasAgentDocs';
// A scan slower than this is logged, so a slow workspace can be noticed
const slowScanMs = 1000;
// How long to wait for a burst of file changes to settle before looking again
const rescanDelayMs = 400;

/**
 * Provider for the AI Docs webview view: every agent doc in the workspace,
 * grouped by type.
 *
 * The view is only shown when the workspace has agent docs, so the scan that
 * decides that cannot wait for the view to open: start() runs it once the
 * extension is active and again whenever files come or go.
 */
export class AiDocsViewProvider implements WebviewViewProvider, Disposable {
  public static readonly viewType = 'codebook-md-ai-docs-view';

  private _view?: WebviewView;
  private _disposables: Disposable[] = [];
  private _roots: AiDocsRoot[] = [];
  private _scanTimer?: ReturnType<typeof setTimeout>;
  private _isViewVisible: boolean = false;
  // One scan runs at a time; a request that arrives meanwhile runs after it
  private _isScanning: boolean = false;
  private _scanIsQueued: boolean = false;
  // The open file as the page shows it now, to skip messages that change nothing
  private _shownActive: string[] = [];
  private _shownApplies: string[] = [];

  constructor(private readonly _extensionContext: ExtensionContext) { }

  dispose() {
    if (this._scanTimer) {
      clearTimeout(this._scanTimer);
      this._scanTimer = undefined;
    }
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  /**
   * Begin watching the workspace and run the first scan. Called once from
   * activate(), whether or not the view is ever opened.
   */
  public start(): void {
    // A doc edited, added or removed; folders coming or going. Edits matter
    // only for markdown, where front matter names and scopes live.
    const markdownWatcher = workspace.createFileSystemWatcher('**/*.{md,markdown}', true, false, true);
    markdownWatcher.onDidChange(() => this._scheduleScan());
    const treeWatcher = workspace.createFileSystemWatcher('**/*', false, true, false);
    treeWatcher.onDidCreate(() => this._scheduleScan());
    treeWatcher.onDidDelete(() => this._scheduleScan());
    this._disposables.push(markdownWatcher, treeWatcher);

    this._disposables.push(
      workspace.onDidChangeWorkspaceFolders(() => this._scheduleScan()),
      workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('codebook-md.aiDocs')) {
          this._scheduleScan(0);
        }
      }),
      window.onDidChangeActiveTextEditor(() => this._syncOpenFile()),
      window.onDidChangeActiveNotebookEditor(() => this._syncOpenFile()),
    );

    // After activation has returned, so the scan never delays start-up
    this._scheduleScan(0);
  }

  /** Read everything from disk again and redraw. */
  public async refresh(): Promise<void> {
    clearDocMetaCache();
    await this._scan();
  }

  /** The docs found by the last scan. */
  public get roots(): AiDocsRoot[] {
    return this._roots;
  }

  public resolveWebviewView(webviewView: WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.file(path.join(this._extensionContext.extensionPath, 'media')),
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist')),
      ],
    };

    this._isViewVisible = webviewView.visible;
    this._updateWebview();

    this._disposables.push(
      webviewView.onDidChangeVisibility(() => {
        this._isViewVisible = webviewView.visible;
        if (this._isViewVisible) {
          // The page reloads from its HTML when shown again, so rebuild it
          // against the file that is open now
          this._updateWebview();
        }
      }),
      webviewView.webview.onDidReceiveMessage(message => this._handleMessage(message)),
    );
  }

  private _handleMessage(message: { command?: unknown; filePath?: unknown; }): void {
    if (message?.command !== 'openFile' || typeof message.filePath !== 'string') {
      return;
    }
    // Only open what the tree lists: the page is not trusted to name any file
    const filePath = message.filePath;
    const listed = this._roots.some(root => root.groups.some(group => group.rows.some(row => row.filePath === filePath)));
    if (!listed) {
      return;
    }
    if (!fs.existsSync(filePath)) {
      window.showErrorMessage(`File not found: ${filePath}`);
      this._scheduleScan(0);
      return;
    }
    const uri = Uri.file(filePath);
    if (isMarkdownFileName(filePath)) {
      commands.executeCommand('vscode.openWith', uri, 'codebook-md');
    } else {
      commands.executeCommand('vscode.open', uri);
    }
  }

  private _scheduleScan(delayMs: number = rescanDelayMs): void {
    if (this._scanTimer) {
      clearTimeout(this._scanTimer);
    }
    this._scanTimer = setTimeout(() => {
      this._scanTimer = undefined;
      void this._scan();
    }, delayMs);
  }

  /** The folders to look in: each workspace folder, then the user's own docs. */
  private _rootSpecs(settings: config.AiDocsConfig): AiDocsRootSpec[] {
    const specs: AiDocsRootSpec[] = (workspace.workspaceFolders ?? [])
      .filter(folder => folder.uri.scheme === 'file')
      .map(folder => ({ name: folder.name, dirPath: folder.uri.fsPath }));
    if (settings.includeUserDocs && specs.length > 0) {
      specs.push(userDocsRoot());
    }
    return specs;
  }

  /**
   * Look through the workspace again. The scan waits on the disk without
   * blocking, so the editor stays responsive while a large workspace is read.
   */
  private async _scan(): Promise<void> {
    if (this._isScanning) {
      this._scanIsQueued = true;
      return;
    }
    this._isScanning = true;
    try {
      const settings = config.getAiDocsConfig();
      const started = Date.now();
      this._roots = settings.enabled
        ? await scanAiDocs(this._rootSpecs(settings), { exclusions: settings.exclusions })
        : [];
      const elapsed = Date.now() - started;
      if (elapsed > slowScanMs) {
        console.log(`AI Docs: scanning the workspace for agent docs took ${elapsed} ms`);
      }
    } catch (error) {
      console.error('AI Docs: could not scan the workspace for agent docs:', error);
    } finally {
      this._isScanning = false;
    }
    if (this._scanIsQueued) {
      this._scanIsQueued = false;
      this._scheduleScan(0);
    }

    // The view appears when the workspace itself has agent docs; your
    // user-level docs alone do not bring it up in every project
    const workspaceDocs = countAiDocs(this._roots.filter(root => !root.isUser));
    commands.executeCommand('setContext', hasAgentDocsContextKey, workspaceDocs > 0);
    this._updateWebview();
  }

  private _updateWebview(): void {
    if (!this._view || !this._isViewVisible) {
      return;
    }
    this._view.webview.html = this._getWebviewContent();
  }

  /** Tell the page which file is open, without rebuilding it. */
  private _syncOpenFile(): void {
    if (!this._view || !this._isViewVisible) {
      return;
    }
    const active = activeFilePaths();
    const applies = appliesPaths(this._roots, activeFilePath());
    if (samePaths(active, this._shownActive) && samePaths(applies, this._shownApplies)) {
      return;
    }
    this._shownActive = active;
    this._shownApplies = applies;
    this._view.webview.postMessage({ command: 'setOpenFile', activePaths: active, appliesPaths: applies });
  }

  private _getWebviewContent(): string {
    const openFile = activeFilePath();
    this._shownActive = activeFilePaths();
    this._shownApplies = appliesPaths(this._roots, openFile);

    const templatePath = path.join(this._extensionContext.extensionPath, 'dist', 'templates', 'aiDocs.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const codiconsCssUri = this._view
      ? this._view.webview.asWebviewUri(
        Uri.file(path.join(this._extensionContext.extensionPath, 'dist', 'codicons', 'codicon.css'))
      ).toString()
      : '';
    const tree = aiDocsTreeHtml(this._roots, { openFile, activePaths: this._shownActive });

    // Replacer functions keep `$` sequences in file names from being read as patterns
    return template
      .replace('{{codiconsCssUri}}', () => escapeHtml(codiconsCssUri))
      .replace('{{tree}}', () => tree);
  }
}
