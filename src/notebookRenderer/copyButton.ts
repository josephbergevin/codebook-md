import type MarkdownIt from 'markdown-it';

/** Codicon `copy` (MIT, @vscode/codicons) */
export const COPY_ICON = '<svg class="copy-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 5V12.73C2.4 12.38 2 11.74 2 11V5C2 2.79 3.79 1 6 1H9C9.74 1 10.38 1.4 10.73 2H6C4.35 2 3 3.35 3 5ZM11 15H6C4.897 15 4 14.103 4 13V5C4 3.897 4.897 3 6 3H11C12.103 3 13 3.897 13 5V13C13 14.103 12.103 15 11 15ZM12 5C12 4.448 11.552 4 11 4H6C5.448 4 5 4.448 5 5V13C5 13.552 5.448 14 6 14H11C11.552 14 12 13.552 12 13V5Z"/></svg>';

/** Codicon `check` (MIT, @vscode/codicons), shown briefly after copying */
export const CHECK_ICON = '<svg class="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.6572 3.13573C13.8583 2.9465 14.175 2.95614 14.3643 3.15722C14.5535 3.35831 14.5438 3.675 14.3428 3.86425L5.84277 11.8642C5.64597 12.0494 5.33756 12.0446 5.14648 11.8535L1.64648 8.35351C1.45121 8.15824 1.45121 7.84174 1.64648 7.64647C1.84174 7.45121 2.15825 7.45121 2.35351 7.64647L5.50976 10.8027L13.6572 3.13573Z"/></svg>';

/**
 * Markup for the copy button placed in the corner of a code block.
 *
 * In untrusted workspaces the notebook renderer's sanitizer strips
 * `<button>`, so this is a `<span role="button">`.
 */
export function copyButtonHtml(): string {
  return `<span class="code-block-copy-button" role="button" tabindex="0" title="Copy" aria-label="Copy">${COPY_ICON}${CHECK_ICON}</span>`;
}

/**
 * markdown-it plugin that adds a copy button to fenced code blocks, like
 * the Markdown Preview's. Clicking it is handled by the renderer, which asks
 * the extension to put the block's text on the clipboard.
 */
export function copyButtonPlugin(md: MarkdownIt): void {
  const previousFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const html = previousFence
      ? previousFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return html.replace(/<pre\b([^>]*)>/, `<pre$1>${copyButtonHtml()}`);
  };
}
