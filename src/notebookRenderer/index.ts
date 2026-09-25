/**
 * Notebook renderer that extends VS Code's built-in markdown cell renderer
 * (`vscode.markdown-it-renderer`) for CodebookMD notebooks.
 *
 * This runs inside the notebook webview, not the extension host, so it must
 * not import `vscode`. It is bundled separately as an ES module
 * (dist/notebookMarkdown.js) and wired up through the `notebookRenderer`
 * contribution in package.json.
 */
import type MarkdownIt from 'markdown-it';
import { TaskListOptions, taskListPlugin } from './taskLists';
import { baseStyles, interactiveStyles, PREVIEW_STYLING_PROPERTY, previewStyles, taskListStyles } from './styles';
import { copyButtonPlugin } from './copyButton';
import { frontMatterPlugin } from './frontMatter';
import { ToggleTaskMessage } from './taskToggle';
import { CopyTextMessage, isSettingsMessage, RendererSettings, RequestSettingsMessage } from './protocol';

/**
 * The parts of the renderer context this module uses. The full type lives
 * in the `vscode-notebook-renderer` package, which we don't depend on.
 */
interface RendererContext {
  getRenderer(id: string): Promise<MarkdownItRendererApi | undefined>;
  /** Present only when VS Code can deliver messages to the extension host */
  postMessage?(message: unknown): void;
  /** Present only when VS Code can deliver messages from the extension host */
  onDidReceiveMessage?(listener: (message: unknown) => void): unknown;
}

interface MarkdownItRendererApi {
  extendMarkdownIt(fn: (md: MarkdownIt) => void): void;
}

/**
 * Registers styles so every markdown cell picks them up. The built-in
 * renderer copies each `<template class="markdown-style">` in the document
 * head into a cell's shadow root when it first renders that cell.
 */
function injectStyles(css: string): void {
  const style = document.createElement('style');
  style.textContent = css;

  const template = document.createElement('template');
  template.classList.add('markdown-style');
  template.content.appendChild(style);
  document.head.appendChild(template);
}

/**
 * Returns the element with the given class that an event targeted, if any.
 * Cells render in shadow roots, so the event's own target is retargeted to
 * the cell's host element; the composed path still starts at the element
 * actually hit (which may be an SVG icon inside the control).
 */
function controlFromEvent(event: Event, className: string): HTMLElement | undefined {
  for (const node of event.composedPath()) {
    if (node instanceof ShadowRoot) {
      return undefined;
    }
    if (node instanceof HTMLElement && node.classList.contains(className)) {
      return node;
    }
  }
  return undefined;
}

/**
 * Asks the extension to flip the task under a checkbox. The checkbox is
 * updated right away for feedback; the edit then re-renders the cell.
 */
function toggle(checkbox: HTMLElement, postMessage: (message: unknown) => void): void {
  const line = Number(checkbox.dataset.line);
  const cellHash = checkbox.dataset.cell;
  if (!Number.isInteger(line) || !cellHash) {
    return;
  }

  const message: ToggleTaskMessage = { type: 'toggleTask', cellHash, line };
  postMessage(message);
  checkbox.setAttribute('aria-checked', String(checkbox.getAttribute('aria-checked') !== 'true'));
}

/** How long the copy button shows its check mark after copying */
const COPIED_FEEDBACK_MS = 1500;

/**
 * Asks the extension to copy the code block a copy button belongs to, and
 * briefly swaps the button's icon for a check mark.
 */
function copy(button: HTMLElement, postMessage: (message: unknown) => void): void {
  const code = button.closest('pre')?.querySelector('code');
  if (!code) {
    return;
  }

  const message: CopyTextMessage = { type: 'copyText', text: code.textContent ?? '' };
  postMessage(message);
  button.classList.add('copied');
  setTimeout(() => button.classList.remove('copied'), COPIED_FEEDBACK_MS);
}

/**
 * Finds the interactive control an event is for and the action to run.
 */
function actionFor(event: Event, postMessage: (message: unknown) => void): (() => void) | undefined {
  const checkbox = controlFromEvent(event, 'task-list-item-checkbox');
  if (checkbox) {
    return () => toggle(checkbox, postMessage);
  }
  const copyButton = controlFromEvent(event, 'code-block-copy-button');
  if (copyButton) {
    return () => copy(copyButton, postMessage);
  }
  return undefined;
}

/**
 * Makes checkboxes and copy buttons clickable and keyboard operable.
 * Listeners run in the capture phase on window, ahead of the notebook's own
 * cell handlers, so using a control doesn't also select the cell or (on
 * double click) open it for editing.
 */
function registerInteractionHandlers(postMessage: (message: unknown) => void): void {
  window.addEventListener('click', (event) => {
    const action = actionFor(event, postMessage);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  }, true);

  window.addEventListener('dblclick', (event) => {
    if (actionFor(event, postMessage)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    const action = actionFor(event, postMessage);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  }, true);
}

/**
 * Applies settings from the extension. Preview styling is switched with a
 * custom property on the root element rather than by adding or removing
 * styles, because cells copy their styles once, on first render.
 */
export function applySettings(settings: RendererSettings, root: HTMLElement = document.documentElement): void {
  root.style.setProperty(PREVIEW_STYLING_PROPERTY, settings.previewStyling ? 'on' : 'off');
}

/**
 * Renderer entry point, called by VS Code when the first markdown cell of a
 * CodebookMD notebook renders.
 */
export async function activate(ctx: RendererContext): Promise<void> {
  const markdownItRenderer = await ctx.getRenderer('vscode.markdown-it-renderer');
  if (!markdownItRenderer) {
    throw new Error("Could not load 'vscode.markdown-it-renderer'");
  }

  // Preview styling defaults to on (the setting's default) until the
  // extension says otherwise
  applySettings({ previewStyling: true });
  injectStyles(baseStyles);
  injectStyles(previewStyles);
  injectStyles(taskListStyles);

  if (ctx.onDidReceiveMessage && ctx.postMessage) {
    ctx.onDidReceiveMessage((message) => {
      if (isSettingsMessage(message)) {
        applySettings(message.settings);
      }
    });
    const request: RequestSettingsMessage = { type: 'requestSettings' };
    ctx.postMessage(request);
  }

  // Without messaging (e.g. some read-only views) a click can't reach the
  // extension, so checkboxes stay display-only and code blocks get no copy
  // button
  const interactive = !!ctx.postMessage;
  if (ctx.postMessage) {
    const postMessage = ctx.postMessage.bind(ctx);
    injectStyles(interactiveStyles);
    registerInteractionHandlers(postMessage);
  }

  const options: TaskListOptions = { interactive };
  markdownItRenderer.extendMarkdownIt((md) => {
    md.use(taskListPlugin, options);
    if (interactive) {
      md.use(copyButtonPlugin);
    }
    // After the copy button, so the front matter wrapper contains it
    md.use(frontMatterPlugin);
  });
}
