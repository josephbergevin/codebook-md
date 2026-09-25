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
import { interactiveCheckboxStyles, PREVIEW_STYLING_PROPERTY, previewStyles, taskListStyles } from './styles';
import { ToggleTaskMessage } from './taskToggle';
import { isSettingsMessage, RendererSettings, RequestSettingsMessage } from './protocol';

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
 * Returns the task list checkbox an event targeted, if any. Cells render in
 * shadow roots, so the event's own target is retargeted to the cell's host
 * element; the composed path still starts at the element actually hit.
 */
function checkboxFromEvent(event: Event): HTMLElement | undefined {
  const target = event.composedPath()[0];
  if (target instanceof HTMLElement && target.classList.contains('task-list-item-checkbox')) {
    return target;
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

/**
 * Makes checkboxes clickable and keyboard operable. Listeners run in the
 * capture phase on window, ahead of the notebook's own cell handlers, so a
 * click on a checkbox doesn't also select the cell or (on double click)
 * open it for editing.
 */
function registerToggleHandlers(postMessage: (message: unknown) => void): void {
  window.addEventListener('click', (event) => {
    const checkbox = checkboxFromEvent(event);
    if (checkbox) {
      event.preventDefault();
      event.stopPropagation();
      toggle(checkbox, postMessage);
    }
  }, true);

  window.addEventListener('dblclick', (event) => {
    if (checkboxFromEvent(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('keydown', (event) => {
    const checkbox = checkboxFromEvent(event);
    if (checkbox && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      event.stopPropagation();
      toggle(checkbox, postMessage);
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
  // extension, so the checkboxes stay display-only
  if (ctx.postMessage) {
    const postMessage = ctx.postMessage.bind(ctx);
    injectStyles(interactiveCheckboxStyles);
    registerToggleHandlers(postMessage);
  }

  const options: TaskListOptions = { interactive: !!ctx.postMessage };
  markdownItRenderer.extendMarkdownIt((md) => {
    md.use(taskListPlugin, options);
  });
}
