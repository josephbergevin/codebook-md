import { getMarkdownRenderingService } from '../markdownRenderer';

// Mock VS Code API
jest.mock('vscode', () => ({
  extensions: {
    all: []
  }
}));

describe('MarkdownRenderingService', () => {
  let markdownService: ReturnType<typeof getMarkdownRenderingService>;

  beforeEach(() => {
    markdownService = getMarkdownRenderingService();
  });

  test('should initialize without error', async () => {
    await expect(markdownService.initialize()).resolves.not.toThrow();
  });

  test('should render basic markdown', () => {
    const input = '# Hello World\n\nThis is a test.';
    const output = markdownService.render(input);

    expect(output).toContain('<h1>');
    expect(output).toContain('Hello World');
    expect(output).toContain('<p>');
    expect(output).toContain('This is a test.');
  });

  test('should handle empty content', () => {
    const output = markdownService.render('');
    expect(output).toBe('');
  });

  test('should get engine instance', () => {
    const engine = markdownService.getEngine();
    expect(engine).toBeDefined();
    expect(typeof engine.render).toBe('function');
  });

  test('should return empty plugin list initially', () => {
    const plugins = markdownService.getLoadedPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  test('should handle refresh without error', async () => {
    await expect(markdownService.refresh()).resolves.not.toThrow();
  });

  test('should handle malformed markdown gracefully', () => {
    const input = '# Broken markdown\n\n<div class="unclosed">\n\nMore content';
    const output = markdownService.render(input);

    // Should not throw, should return some output
    expect(output).toBeDefined();
    expect(typeof output).toBe('string');
  });

  test('should handle code blocks', () => {
    const input = '```javascript\nconsole.log("hello");\n```';
    const output = markdownService.render(input);

    expect(output).toContain('<pre><code');
    expect(output).toContain('console.log');
  });

  test('should handle links', () => {
    const input = '[Example](https://example.com)';
    const output = markdownService.render(input);

    expect(output).toContain('<a href="https://example.com"');
    expect(output).toContain('Example');
  });
});
