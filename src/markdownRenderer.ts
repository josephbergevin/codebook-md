import * as vscode from 'vscode';

// Import markdown-it and types
import MarkdownIt = require('markdown-it');

/**
 * Interface for markdown-it plugins from other extensions
 */
interface MarkdownItPlugin {
  extensionId: string;
  plugin: (md: MarkdownIt) => MarkdownIt;
}

/**
 * Service for managing markdown rendering with contribution points
 * This service collects markdown-it plugins from other VS Code extensions
 * and provides a unified markdown rendering engine compatible with the ecosystem
 */
export class MarkdownRenderingService {
  private markdownEngine: MarkdownIt;
  private plugins: MarkdownItPlugin[] = [];
  private isInitialized = false;

  constructor() {
    // Initialize markdown-it with safe defaults
    this.markdownEngine = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      breaks: false
    });
  }

  /**
   * Initialize the markdown rendering service by discovering and loading
   * markdown-it plugins from other installed extensions
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.discoverMarkdownExtensions();
      this.applyPlugins();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize markdown rendering service:', error);
      // Continue with basic markdown rendering even if plugin discovery fails
      this.isInitialized = true;
    }
  }

  /**
   * Render markdown content using the configured engine with all loaded plugins
   */
  public render(content: string): string {
    if (!this.isInitialized) {
      // Fallback to basic rendering if not initialized
      return this.markdownEngine.render(content);
    }

    try {
      return this.markdownEngine.render(content);
    } catch (error) {
      console.error('Error rendering markdown:', error);
      // Fallback to basic text if rendering fails
      return `<pre>${this.escapeHtml(content)}</pre>`;
    }
  }

  /**
   * Get the configured markdown-it instance
   * This can be used by other parts of CodebookMD for advanced rendering needs
   */
  public getEngine(): MarkdownIt {
    return this.markdownEngine;
  }

  /**
   * Discover markdown extensions that contribute to the markdown-it engine
   * This searches for extensions that export extendMarkdownIt functions
   */
  private async discoverMarkdownExtensions(): Promise<void> {
    try {
      // Get all installed extensions
      const extensions = vscode.extensions.all;

      for (const extension of extensions) {
        await this.checkExtensionForMarkdownSupport(extension);
      }

      console.log(`Discovered ${this.plugins.length} markdown plugins from extensions`);
    } catch (error) {
      console.error('Error discovering markdown extensions:', error);
    }
  }

  /**
   * Check if an extension provides markdown-it plugins
   */
  private async checkExtensionForMarkdownSupport(extension: vscode.Extension<unknown>): Promise<void> {
    try {
      // Skip our own extension to avoid conflicts
      if (extension.id === 'josephbergevin.codebook-md') {
        return;
      }

      // Check if extension contributes markdown plugins
      const packageJSON = extension.packageJSON;
      const contributes = packageJSON?.contributes;

      if (!contributes) {
        return;
      }

      // Check for markdown contribution points
      const hasMarkdownContribs =
        contributes['markdown.markdownItPlugins'] === true ||
        contributes['markdown.previewStyles'] ||
        contributes['markdown.previewScripts'];

      if (!hasMarkdownContribs) {
        return;
      }

      // Activate the extension if it's not already active
      if (!extension.isActive) {
        try {
          await extension.activate();
        } catch (error) {
          console.warn(`Failed to activate extension ${extension.id}:`, error);
          return;
        }
      }

      // Check if the extension exports extendMarkdownIt function
      const exports = extension.exports as { extendMarkdownIt?: (md: MarkdownIt) => MarkdownIt; };
      if (exports && typeof exports.extendMarkdownIt === 'function') {
        console.log(`Found markdown plugin in extension: ${extension.id}`);

        this.plugins.push({
          extensionId: extension.id,
          plugin: exports.extendMarkdownIt
        });
      }
    } catch (error) {
      console.warn(`Error checking extension ${extension.id} for markdown support:`, error);
    }
  }

  /**
   * Apply all discovered plugins to the markdown-it engine
   */
  private applyPlugins(): void {
    for (const pluginInfo of this.plugins) {
      try {
        console.log(`Applying markdown plugin from ${pluginInfo.extensionId}`);
        this.markdownEngine = pluginInfo.plugin(this.markdownEngine);
      } catch (error) {
        console.error(`Error applying plugin from ${pluginInfo.extensionId}:`, error);
      }
    }
  }

  /**
   * Escape HTML special characters for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Refresh the markdown engine by reloading all plugins
   * This can be called when extensions are installed/uninstalled
   */
  public async refresh(): Promise<void> {
    this.plugins = [];
    this.isInitialized = false;

    // Reinitialize with fresh plugin discovery
    await this.initialize();
  }

  /**
   * Get information about loaded plugins for debugging
   */
  public getLoadedPlugins(): string[] {
    return this.plugins.map(p => p.extensionId);
  }
}

// Global singleton instance
let markdownService: MarkdownRenderingService | undefined;

/**
 * Get the global markdown rendering service instance
 */
export function getMarkdownRenderingService(): MarkdownRenderingService {
  if (!markdownService) {
    markdownService = new MarkdownRenderingService();
  }
  return markdownService;
}
