import * as vscode from 'vscode';
import { handleRendererMessage, registerNotebookRendererMessaging } from '../notebookRendererMessaging';
import { hashCellText } from '../notebookRenderer/taskToggle';

/**
 * Makes workspace.getConfiguration return the given previewStyling value
 * (or the caller's default when undefined).
 */
function setPreviewStyling(value: boolean | undefined): void {
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((_key: string, defaultValue: unknown) => value ?? defaultValue),
  });
}

function fakeMessaging(): vscode.NotebookRendererMessaging {
  return {
    postMessage: jest.fn(async () => true),
    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
  } as unknown as vscode.NotebookRendererMessaging;
}

const editor = { notebook: { getCells: () => [] } } as unknown as vscode.NotebookEditor;

describe('handleRendererMessage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requestSettings', () => {
    test('replies to the requesting editor with previewStyling on by default', async () => {
      setPreviewStyling(undefined);
      const messaging = fakeMessaging();
      await handleRendererMessage(messaging, editor, { type: 'requestSettings' });
      expect(messaging.postMessage).toHaveBeenCalledWith(
        { type: 'settings', settings: { previewStyling: true } }, editor);
    });

    test('reports previewStyling off when the setting is off', async () => {
      setPreviewStyling(false);
      const messaging = fakeMessaging();
      await handleRendererMessage(messaging, editor, { type: 'requestSettings' });
      expect(messaging.postMessage).toHaveBeenCalledWith(
        { type: 'settings', settings: { previewStyling: false } }, editor);
    });
  });

  describe('toggleTask', () => {
    test('edits the matching cell', async () => {
      const text = '- [ ] task';
      const cell = {
        kind: vscode.NotebookCellKind.Markup,
        document: { uri: 'cell-uri', getText: () => text, lineCount: 1, lineAt: () => ({ text }) },
      };
      const notebookEditor = { notebook: { getCells: () => [cell] } } as unknown as vscode.NotebookEditor;
      (vscode.workspace.applyEdit as jest.Mock).mockClear();

      await handleRendererMessage(fakeMessaging(), notebookEditor,
        { type: 'toggleTask', cellHash: hashCellText(text), line: 0 });
      expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    });
  });

  test('ignores unknown messages', async () => {
    const messaging = fakeMessaging();
    await handleRendererMessage(messaging, editor, { type: 'somethingElse' });
    expect(messaging.postMessage).not.toHaveBeenCalled();
  });
});

describe('registerNotebookRendererMessaging', () => {
  test('broadcasts new settings to every notebook when previewStyling changes', () => {
    const messaging = fakeMessaging();
    (vscode.notebooks.createRendererMessaging as jest.Mock).mockReturnValue(messaging);
    let onConfigChange: ((e: { affectsConfiguration(s: string): boolean }) => void) | undefined;
    (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation((listener) => {
      onConfigChange = listener;
      return { dispose: jest.fn() };
    });
    setPreviewStyling(false);

    registerNotebookRendererMessaging({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    onConfigChange!({ affectsConfiguration: (s) => s === 'codebook-md.markdown.previewStyling' });

    // No editor argument: sent to all notebooks
    expect(messaging.postMessage).toHaveBeenCalledWith({ type: 'settings', settings: { previewStyling: false } });
  });

  test('ignores unrelated configuration changes', () => {
    const messaging = fakeMessaging();
    (vscode.notebooks.createRendererMessaging as jest.Mock).mockReturnValue(messaging);
    let onConfigChange: ((e: { affectsConfiguration(s: string): boolean }) => void) | undefined;
    (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation((listener) => {
      onConfigChange = listener;
      return { dispose: jest.fn() };
    });

    registerNotebookRendererMessaging({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    onConfigChange!({ affectsConfiguration: () => false });

    expect(messaging.postMessage).not.toHaveBeenCalled();
  });
});
