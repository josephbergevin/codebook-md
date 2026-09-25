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
import { taskListPlugin } from './taskLists';
import { markdownCellStyles } from './styles';

/**
 * The parts of the renderer context this module uses. The full type lives
 * in the `vscode-notebook-renderer` package, which we don't depend on.
 */
interface RendererContext {
  getRenderer(id: string): Promise<MarkdownItRendererApi | undefined>;
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
 * Renderer entry point, called by VS Code when the first markdown cell of a
 * CodebookMD notebook renders.
 */
export async function activate(ctx: RendererContext): Promise<void> {
  const markdownItRenderer = await ctx.getRenderer('vscode.markdown-it-renderer');
  if (!markdownItRenderer) {
    throw new Error("Could not load 'vscode.markdown-it-renderer'");
  }

  injectStyles(markdownCellStyles);

  markdownItRenderer.extendMarkdownIt((md) => {
    md.use(taskListPlugin);
  });
}
