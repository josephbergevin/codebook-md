/**
 * Styles that always apply, injected before the others so the preview
 * styles can override them.
 */
export const baseStyles = `
  /* The front matter table only shows while preview styling is on;
     otherwise the YAML source is shown */
  .frontmatter-table {
    display: none;
  }
`;

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

    /* Front matter as a key/value table, like the preview */
    table.frontmatter-table {
      display: table;
      margin-bottom: 16px;
    }

    table.frontmatter-table + .frontmatter-source {
      display: none;
    }

    table.frontmatter-table > tbody > tr > th,
    table.frontmatter-table > tbody > tr > td {
      padding: 6px 13px;
      border: 1px solid var(--vscode-contrastBorder, var(--vscode-widget-border, rgba(127, 127, 127, 0.35)));
      text-align: left;
      vertical-align: top;
    }

    table.frontmatter-table > tbody > tr > th {
      font-weight: 600;
      white-space: nowrap;
    }

    table.frontmatter-table > tbody > tr:nth-child(2n) {
      background-color: transparent;
    }

    table.frontmatter-table td > ul {
      margin: 0;
      padding-left: 1.2em;
    }

    /* The copy button's other styles are in interactiveStyles */
    pre > .code-block-copy-button {
      display: flex;
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
 * Styles for the interactive controls - clickable checkboxes and the
 * code block copy button - added only when the renderer can message the
 * extension, which is what makes those controls work.
 */
export const interactiveStyles = `
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

  /* Copy button in the corner of code blocks, like the preview's */
  pre {
    position: relative;
  }

  /* Shown only with preview styling (see previewStyles): without it code
     blocks have no padding for the button to sit in */
  .code-block-copy-button {
    position: absolute;
    top: 8px;
    right: 8px;
    display: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    box-sizing: border-box;
    border: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.35));
    border-radius: 4px;
    background-color: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    color: var(--vscode-editor-foreground);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  pre:hover > .code-block-copy-button,
  .code-block-copy-button:focus-visible {
    opacity: 1;
  }

  .code-block-copy-button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .code-block-copy-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .code-block-copy-button .check-icon,
  .code-block-copy-button.copied .copy-icon {
    display: none;
  }

  .code-block-copy-button.copied .check-icon {
    display: block;
  }

  .code-block-copy-button.copied {
    color: var(--vscode-testing-iconPassed, #73c991);
    opacity: 1;
  }
`;
