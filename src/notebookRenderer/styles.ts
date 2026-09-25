/**
 * Custom property that switches the preview-like styles on and off. The
 * renderer sets it on the webview's root element; custom properties inherit
 * into each cell's shadow root, so flipping it restyles every rendered cell
 * without re-rendering.
 */
export const PREVIEW_STYLING_PROPERTY = '--codebook-md-preview-styling';

/**
 * Styles that make CodebookMD markdown cells look like the VS Code
 * Markdown Preview (extensions/markdown-language-features/media/markdown.css)
 * instead of the notebook renderer's more minimal defaults. They apply only
 * while PREVIEW_STYLING_PROPERTY is `on` (the codebook-md.markdown.previewStyling
 * setting).
 *
 * Each cell renders inside its own shadow root, so the preview's
 * `.vscode-dark` / `.vscode-light` body-class selectors can't reach it.
 * Border and stripe colors are therefore derived from the theme's
 * foreground color with `color-mix`, which works in every theme. Borders
 * prefer `--vscode-contrastBorder`, which only high-contrast themes define,
 * so rules stay clearly visible there.
 */
export const previewStyles = `
  @container style(${PREVIEW_STYLING_PROPERTY}: on) {
    /* Headings: bold like the preview, with a rule under h1 and h2 */
    h1, h2, h3, h4, h5, h6 {
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 16px;
      line-height: 1.25;
    }

    h1 {
      font-size: 2em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground) 18%, transparent));
    }

    h2 {
      font-size: 1.5em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground) 18%, transparent));
    }

    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    h5 { font-size: 0.875em; }
    h6 { font-size: 0.85em; }

    p {
      margin-bottom: 16px;
    }

    hr {
      height: 1px;
      border-bottom: 1px solid var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground) 18%, transparent));
    }

    /* Tables: horizontal rules only, like the preview, plus striped rows */
    table {
      border-collapse: collapse;
      margin-bottom: 0.7em;
    }

    table th,
    table td {
      border: none;
    }

    table > thead > tr > th {
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground) 69%, transparent));
    }

    table > tbody > tr + tr > td {
      border-top: 1px solid var(--vscode-contrastBorder, color-mix(in srgb, var(--vscode-foreground) 18%, transparent));
    }

    table > tbody > tr:nth-child(2n) {
      background-color: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
    }

    blockquote {
      margin: 0 0 16px 0;
      padding: 0 16px 0 10px;
      border-left: 5px solid var(--vscode-textBlockQuote-border);
      background: var(--vscode-textBlockQuote-background);
      border-radius: 2px;
    }

    /* Fenced code blocks shown as markdown (not executable cells) */
    pre {
      padding: 16px;
      border-radius: 3px;
      overflow: auto;
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, transparent);
    }
  }
`;

/**
 * Task list checkbox styles. These always apply: without them a task
 * item's checkbox would be invisible.
 */
export const taskListStyles = `
  /* Task lists: drop the bullet and put the checkbox where it was */
  .contains-task-list {
    padding-left: 2em;
  }

  .task-list-item {
    list-style-type: none;
  }

  .task-list-item-checkbox {
    display: inline-block;
    position: relative;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    margin: 0 0.4em 0.2em -1.6em;
    vertical-align: middle;
    border: 1px solid var(--vscode-checkbox-border, var(--vscode-foreground));
    border-radius: 3px;
    background-color: var(--vscode-checkbox-background, transparent);
  }

  .task-list-item-checkbox[aria-checked="true"]::after {
    content: "";
    position: absolute;
    left: 4px;
    top: 1px;
    width: 3px;
    height: 7px;
    border: solid var(--vscode-checkbox-foreground, var(--vscode-foreground));
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
`;

/**
 * Extra checkbox styles, added only when the renderer can message the
 * extension (i.e. when clicking a checkbox actually toggles it).
 */
export const interactiveCheckboxStyles = `
  .task-list-item-checkbox {
    cursor: pointer;
  }

  .task-list-item-checkbox:hover {
    border-color: var(--vscode-focusBorder, var(--vscode-foreground));
  }

  .task-list-item-checkbox:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 1px;
  }
`;
