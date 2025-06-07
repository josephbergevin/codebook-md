import * as vscode from 'vscode';

/**
 * Markdown contribution point integration for CodebookMD
 * This module enables compatibility with VS Code's markdown extension ecosystem
 * by integrating with the built-in markdown preview contribution points.
 */

export interface MarkdownItInstance {
  render(content: string): string;
  use(plugin: MarkdownItPlugin, options?: unknown): MarkdownItInstance;
}

interface MarkdownItPlugin {
  (md: MarkdownItInstance, options?: unknown): void;
}

interface MarkdownContributions {
  styles: string[];
  scripts: string[];
  plugins: MarkdownItPlugin[];
}

/**
 * Collects markdown contribution points from all installed extensions
 */
export function collectMarkdownContributions(): MarkdownContributions {
  const contributions: MarkdownContributions = {
    styles: [],
    scripts: [],
    plugins: []
  };

  // Get all extensions
  const extensions = vscode.extensions.all;

  for (const extension of extensions) {
    const contributes = extension.packageJSON?.contributes;
    if (!contributes) {
      continue;
    }

    // Collect markdown preview styles
    if (contributes['markdown.previewStyles']) {
      const styles = Array.isArray(contributes['markdown.previewStyles'])
        ? contributes['markdown.previewStyles']
        : [contributes['markdown.previewStyles']];

      for (const style of styles) {
        const styleUri = vscode.Uri.joinPath(extension.extensionUri, style);
        contributions.styles.push(styleUri.toString());
      }
    }

    // Collect markdown preview scripts
    if (contributes['markdown.previewScripts']) {
      const scripts = Array.isArray(contributes['markdown.previewScripts'])
        ? contributes['markdown.previewScripts']
        : [contributes['markdown.previewScripts']];

      for (const script of scripts) {
        const scriptUri = vscode.Uri.joinPath(extension.extensionUri, script);
        contributions.scripts.push(scriptUri.toString());
      }
    }

    // Collect markdown-it plugins
    if (contributes['markdown.markdownItPlugins'] && extension.isActive) {
      try {
        const extExports = extension.exports;
        if (extExports && typeof extExports.extendMarkdownIt === 'function') {
          contributions.plugins.push(extExports.extendMarkdownIt);
        }
      } catch (error) {
        console.warn(`Failed to load markdown-it plugin from ${extension.id}:`, error);
      }
    }
  }

  return contributions;
}

/**
 * Creates a markdown-it instance with all registered plugins
 */
export function createMarkdownItWithPlugins(): MarkdownItInstance | null {
  // Import markdown-it dynamically to avoid bundling issues
  let markdownIt: unknown;
  try {
    markdownIt = require('markdown-it');
  } catch (error) {
    console.warn('markdown-it not available, falling back to basic markdown rendering');
    return null;
  }

  const md = (markdownIt as (options?: unknown) => MarkdownItInstance)({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false
  });

  // Apply all registered markdown-it plugins
  const contributions = collectMarkdownContributions();

  for (const plugin of contributions.plugins) {
    try {
      if (typeof plugin === 'function') {
        md.use(plugin);
      }
    } catch (error) {
      console.warn('Failed to apply markdown-it plugin:', error);
    }
  }

  return md;
}

/**
 * Renders markdown content using the enhanced markdown-it instance
 * with all registered plugins and contribution points
 */
export function renderMarkdownWithContributions(content: string): string {
  const md = createMarkdownItWithPlugins();

  if (!md) {
    // Fallback to basic markdown rendering if markdown-it is not available
    return content;
  }

  try {
    return md.render(content);
  } catch (error) {
    console.warn('Error rendering markdown with contributions:', error);
    return content;
  }
}

/**
 * Gets CSS styles from all markdown contribution points
 */
export function getMarkdownContributionStyles(): string[] {
  const contributions = collectMarkdownContributions();
  return contributions.styles;
}

/**
 * Gets JavaScript files from all markdown contribution points
 */
export function getMarkdownContributionScripts(): string[] {
  const contributions = collectMarkdownContributions();
  return contributions.scripts;
}

/**
 * Creates HTML content that includes all markdown contribution points
 * for use in webviews or other HTML contexts
 */
export function createMarkdownHtmlWithContributions(markdownContent: string, webview?: vscode.Webview): string {
  const renderedMarkdown = renderMarkdownWithContributions(markdownContent);
  const contributions = collectMarkdownContributions();

  let stylesHtml = '';
  let scriptsHtml = '';

  // Add styles
  for (const styleUrl of contributions.styles) {
    if (webview) {
      // Convert to webview URI if webview is provided
      const styleUri = webview.asWebviewUri(vscode.Uri.parse(styleUrl));
      stylesHtml += `<link rel="stylesheet" href="${styleUri.toString()}">\n`;
    } else {
      stylesHtml += `<link rel="stylesheet" href="${styleUrl}">\n`;
    }
  }

  // Add scripts
  for (const scriptUrl of contributions.scripts) {
    if (webview) {
      // Convert to webview URI if webview is provided
      const scriptUri = webview.asWebviewUri(vscode.Uri.parse(scriptUrl));
      scriptsHtml += `<script src="${scriptUri.toString()}"></script>\n`;
    } else {
      scriptsHtml += `<script src="${scriptUrl}"></script>\n`;
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${stylesHtml}
</head>
<body>
  ${renderedMarkdown}
  ${scriptsHtml}
</body>
</html>`;
}

/**
 * Extension function that can be called by the markdown preview
 * to extend markdown-it with CodebookMD-specific features
 */
export function extendMarkdownIt(md: MarkdownItInstance): MarkdownItInstance {
  // Add CodebookMD-specific markdown-it plugins here if needed

  // For now, we just return the markdown-it instance as-is
  // but this is where you could add custom syntax extensions
  return md;
}
