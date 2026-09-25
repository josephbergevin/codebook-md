import * as vscode from 'vscode';
import { isMarkdownPreviewStylingEnabled } from './config';
import {
  MARKDOWN_RENDERER_ID,
  RendererSettings,
  SettingsMessage,
  isCopyTextMessage,
  isRequestSettingsMessage,
} from './notebookRenderer/protocol';
import { isToggleTaskMessage } from './notebookRenderer/taskToggle';
import { toggleTaskInNotebook } from './taskListToggle';

/**
 * Reads the settings the notebook renderer needs.
 */
export function currentRendererSettings(): RendererSettings {
  return { previewStyling: isMarkdownPreviewStylingEnabled() };
}

/**
 * Builds the message that carries the current settings to the renderer.
 */
function settingsMessage(): SettingsMessage {
  return { type: 'settings', settings: currentRendererSettings() };
}

/**
 * Handles one message from the renderer.
 */
export async function handleRendererMessage(
  messaging: vscode.NotebookRendererMessaging,
  editor: vscode.NotebookEditor,
  message: unknown
): Promise<void> {
  if (isRequestSettingsMessage(message)) {
    await messaging.postMessage(settingsMessage(), editor);
    return;
  }

  if (isCopyTextMessage(message)) {
    await vscode.env.clipboard.writeText(message.text);
    return;
  }

  if (isToggleTaskMessage(message)) {
    try {
      await toggleTaskInNotebook(editor.notebook, message);
    } catch (error) {
      console.log('codebook-md: failed to toggle task list item', error);
      vscode.window.showErrorMessage(`CodebookMD: couldn't update the checkbox: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Connects the extension to the CodebookMD notebook renderer: applies
 * task list checkbox clicks, copies code blocks to the clipboard, answers
 * settings requests, and pushes new settings to every open notebook when
 * they change.
 *
 * The renderer extends VS Code's shared markdown renderer, so this also
 * serves markdown cells in other notebook types.
 */
export function registerNotebookRendererMessaging(context: vscode.ExtensionContext): void {
  const messaging = vscode.notebooks.createRendererMessaging(MARKDOWN_RENDERER_ID);

  context.subscriptions.push(
    messaging.onDidReceiveMessage(({ editor, message }) => handleRendererMessage(messaging, editor, message)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codebook-md.markdown.previewStyling')) {
        // No editor argument: broadcast to every notebook using the renderer
        messaging.postMessage(settingsMessage());
      }
    })
  );
}
