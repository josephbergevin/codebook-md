/**
 * Messages exchanged between the CodebookMD notebook renderer (webview side)
 * and the extension host. Nothing here may import `vscode` or touch the DOM,
 * since both sides bundle this file.
 */

/** Id of the CodebookMD notebook renderer, as declared in package.json. */
export const MARKDOWN_RENDERER_ID = 'codebook-md.markdown-extensions';

/**
 * Settings the renderer needs from the extension.
 */
export interface RendererSettings {
  /** codebook-md.markdown.previewStyling */
  previewStyling: boolean;
}

/**
 * Renderer -> extension: sent when the renderer starts, asking for the
 * current settings.
 */
export interface RequestSettingsMessage {
  type: 'requestSettings';
}

/**
 * Extension -> renderer: the current settings, sent in reply to
 * `requestSettings` and again whenever a setting changes.
 */
export interface SettingsMessage {
  type: 'settings';
  settings: RendererSettings;
}

/**
 * Renderer -> extension: put text on the clipboard (a code block's copy
 * button). The extension does the copying because clipboard access from
 * the notebook webview isn't guaranteed.
 */
export interface CopyTextMessage {
  type: 'copyText';
  text: string;
}

/**
 * Checks that a message is a well-formed `copyText` request.
 */
export function isCopyTextMessage(message: unknown): message is CopyTextMessage {
  return !!message && typeof message === 'object'
    && (message as Record<string, unknown>).type === 'copyText'
    && typeof (message as Record<string, unknown>).text === 'string';
}

/**
 * Checks that a message is a `requestSettings` request.
 */
export function isRequestSettingsMessage(message: unknown): message is RequestSettingsMessage {
  return !!message && typeof message === 'object'
    && (message as Record<string, unknown>).type === 'requestSettings';
}

/**
 * Checks that a message is a well-formed `settings` message.
 */
export function isSettingsMessage(message: unknown): message is SettingsMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const m = message as Record<string, unknown>;
  if (m.type !== 'settings' || !m.settings || typeof m.settings !== 'object') {
    return false;
  }
  return typeof (m.settings as Record<string, unknown>).previewStyling === 'boolean';
}
