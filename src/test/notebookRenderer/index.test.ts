/**
 * @jest-environment jsdom
 */
import MarkdownIt from 'markdown-it';
import { activate, applySettings } from '../../notebookRenderer/index';
import { PREVIEW_STYLING_PROPERTY } from '../../notebookRenderer/styles';
import { hashCellText } from '../../notebookRenderer/taskToggle';

/**
 * Stands in for VS Code's built-in markdown renderer: it hands out a
 * markdown-it instance to extend, and renders a cell the way the real one
 * does - into a shadow root that gets a copy of every
 * `<template class="markdown-style">` in the document head.
 */
class FakeMarkdownRenderer {
  readonly md = new MarkdownIt({ html: true, linkify: true });

  extendMarkdownIt(fn: (md: MarkdownIt) => void): void {
    fn(this.md);
  }

  renderCell(text: string): { host: HTMLElement; root: ShadowRoot } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    for (const template of Array.from(document.getElementsByClassName('markdown-style'))) {
      root.appendChild((template as HTMLTemplateElement).content.cloneNode(true));
    }
    const preview = document.createElement('div');
    preview.id = 'preview';
    preview.innerHTML = this.md.render(text);
    root.appendChild(preview);
    return { host, root };
  }
}

const CELL = 'Todo:\n\n- [ ] first\n- [x] second';

// activate() adds listeners to the shared jsdom window; record them so each
// test can remove them and not see earlier tests' handlers
const windowListeners: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];
const addWindowListener = window.addEventListener.bind(window);
jest.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
  windowListeners.push([type, listener, options]);
  addWindowListener(type, listener, options);
});

afterEach(() => {
  for (const [type, listener, options] of windowListeners.splice(0)) {
    window.removeEventListener(type, listener, options);
  }
});

/**
 * Runs activate() against a fresh document and renders one cell.
 */
async function setup(options: { messaging: boolean }) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty(PREVIEW_STYLING_PROPERTY);

  const renderer = new FakeMarkdownRenderer();
  const posted: unknown[] = [];
  let sendToRenderer: ((message: unknown) => void) | undefined;

  await activate({
    getRenderer: async () => renderer,
    ...(options.messaging ? {
      postMessage: (message: unknown) => posted.push(message),
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        sendToRenderer = listener;
      },
    } : {}),
  });

  const { host, root } = renderer.renderCell(CELL);
  const checkboxes = Array.from(root.querySelectorAll<HTMLElement>('.task-list-item-checkbox'));
  return { host, root, checkboxes, posted, send: (m: unknown) => sendToRenderer?.(m) };
}

describe('notebook renderer activate', () => {
  test('fails clearly when the built-in markdown renderer is missing', async () => {
    await expect(activate({ getRenderer: async () => undefined })).rejects.toThrow('vscode.markdown-it-renderer');
  });

  describe('with messaging', () => {
    test('asks the extension for settings on startup', async () => {
      const { posted } = await setup({ messaging: true });
      expect(posted[0]).toEqual({ type: 'requestSettings' });
    });

    test('renders task items as checkboxes inside the cell', async () => {
      const { checkboxes } = await setup({ messaging: true });
      expect(checkboxes.map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    });

    test('adds the preview styles to each cell', async () => {
      const { root } = await setup({ messaging: true });
      const css = Array.from(root.querySelectorAll('style')).map((s) => s.textContent).join('');
      expect(css).toContain(`@container style(${PREVIEW_STYLING_PROPERTY}: on)`);
      expect(css).toContain('.task-list-item-checkbox');
    });

    describe('clicking a checkbox', () => {
      test('posts a toggle for its cell and line', async () => {
        const { checkboxes, posted } = await setup({ messaging: true });
        checkboxes[0].click();
        expect(posted).toContainEqual({ type: 'toggleTask', cellHash: hashCellText(CELL), line: 2 });
      });

      test('flips the checkbox right away', async () => {
        const { checkboxes } = await setup({ messaging: true });
        checkboxes[0].click();
        expect(checkboxes[0].getAttribute('aria-checked')).toBe('true');
      });

      test('does not reach the notebook\'s own click handlers', async () => {
        const { host, checkboxes } = await setup({ messaging: true });
        const cellClick = jest.fn();
        host.addEventListener('click', cellClick);
        checkboxes[0].click();
        expect(cellClick).not.toHaveBeenCalled();
      });
    });

    test('lets clicks elsewhere in the cell through without toggling', async () => {
      const { host, root, posted } = await setup({ messaging: true });
      const cellClick = jest.fn();
      host.addEventListener('click', cellClick);
      (root.querySelector('p') as HTMLElement).click();
      expect(cellClick).toHaveBeenCalled();
      expect(posted.filter((m) => (m as { type: string }).type === 'toggleTask')).toEqual([]);
    });

    test('stops a double click on a checkbox from opening the cell for editing', async () => {
      const { host, checkboxes } = await setup({ messaging: true });
      const cellDblClick = jest.fn();
      host.addEventListener('dblclick', cellDblClick);
      checkboxes[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
      expect(cellDblClick).not.toHaveBeenCalled();
    });

    test.each([' ', 'Enter'])('toggles a focused checkbox with %p', async (key) => {
      const { checkboxes, posted } = await setup({ messaging: true });
      checkboxes[1].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      expect(posted).toContainEqual({ type: 'toggleTask', cellHash: hashCellText(CELL), line: 3 });
    });

    test('ignores other keys', async () => {
      const { checkboxes, posted } = await setup({ messaging: true });
      checkboxes[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }));
      expect(posted).toEqual([{ type: 'requestSettings' }]);
    });

    test('applies settings sent by the extension', async () => {
      const { send } = await setup({ messaging: true });
      send({ type: 'settings', settings: { previewStyling: false } });
      expect(document.documentElement.style.getPropertyValue(PREVIEW_STYLING_PROPERTY)).toBe('off');
    });

    test('ignores malformed settings messages', async () => {
      const { send } = await setup({ messaging: true });
      send({ type: 'settings', settings: { previewStyling: 'off' } });
      expect(document.documentElement.style.getPropertyValue(PREVIEW_STYLING_PROPERTY)).toBe('on');
    });
  });

  describe('without messaging', () => {
    test('turns preview styling on by default', async () => {
      await setup({ messaging: false });
      expect(document.documentElement.style.getPropertyValue(PREVIEW_STYLING_PROPERTY)).toBe('on');
    });

    test('renders checkboxes that are not keyboard focusable', async () => {
      const { checkboxes } = await setup({ messaging: false });
      expect(checkboxes[0].hasAttribute('tabindex')).toBe(false);
      expect(checkboxes[0].getAttribute('aria-disabled')).toBe('true');
    });

    test('leaves checkboxes display-only', async () => {
      const { checkboxes } = await setup({ messaging: false });
      checkboxes[0].click();
      expect(checkboxes[0].getAttribute('aria-checked')).toBe('false');
    });
  });
});

describe('applySettings', () => {
  test('sets the styling property to off', () => {
    const root = document.createElement('div');
    applySettings({ previewStyling: false }, root);
    expect(root.style.getPropertyValue(PREVIEW_STYLING_PROPERTY)).toBe('off');
  });

  test('sets the styling property to on', () => {
    const root = document.createElement('div');
    applySettings({ previewStyling: true }, root);
    expect(root.style.getPropertyValue(PREVIEW_STYLING_PROPERTY)).toBe('on');
  });
});
