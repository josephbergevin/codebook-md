import MarkdownIt from 'markdown-it';
import { findTaskMarker, hashCellText, isToggleTaskMessage } from '../../notebookRenderer/taskToggle';

describe('hashCellText', () => {
  test('returns the same hash for the same text', () => {
    expect(hashCellText('- [ ] a')).toBe(hashCellText('- [ ] a'));
  });

  test('returns different hashes for different text', () => {
    expect(hashCellText('- [ ] a')).not.toBe(hashCellText('- [x] a'));
  });

  test('returns an 8-digit hex string', () => {
    expect(hashCellText('')).toMatch(/^[0-9a-f]{8}$/);
  });

  test('treats CRLF and LF line endings as the same text', () => {
    expect(hashCellText('a\r\nb')).toBe(hashCellText('a\nb'));
  });

  test('matches the text markdown-it sees after normalizing its input', () => {
    // The renderer hashes markdown-it's normalized state.src; the extension
    // hashes the raw cell text. Both must agree.
    const raw = 'line one\r\n- [ ] task\r\n';
    let src = '';
    const md = new MarkdownIt();
    md.core.ruler.push('capture', (state) => {
      src = state.src;
    });
    md.render(raw);
    expect(hashCellText(src)).toBe(hashCellText(raw));
  });
});

describe('findTaskMarker', () => {
  test('finds an unchecked marker after a dash', () => {
    expect(findTaskMarker('- [ ] todo')).toEqual({ column: 3, checked: false });
  });

  test('finds a checked marker', () => {
    expect(findTaskMarker('- [x] done')).toEqual({ column: 3, checked: true });
  });

  test('treats an uppercase X as checked', () => {
    expect(findTaskMarker('* [X] done')?.checked).toBe(true);
  });

  test('accounts for indentation of a nested item', () => {
    expect(findTaskMarker('    - [ ] nested')?.column).toBe(7);
  });

  test('finds a marker in an ordered list', () => {
    expect(findTaskMarker('12. [ ] twelfth')?.column).toBe(5);
  });

  test('finds a marker inside a blockquote', () => {
    expect(findTaskMarker('> - [ ] quoted')?.column).toBe(5);
  });

  test('returns undefined for a plain list item', () => {
    expect(findTaskMarker('- plain')).toBeUndefined();
  });

  test('returns undefined for a marker that is not after a list marker', () => {
    expect(findTaskMarker('[ ] not a list')).toBeUndefined();
  });
});

describe('isToggleTaskMessage', () => {
  test('accepts a well-formed message', () => {
    expect(isToggleTaskMessage({ type: 'toggleTask', cellHash: 'abc', line: 2 })).toBe(true);
  });

  test('rejects a different message type', () => {
    expect(isToggleTaskMessage({ type: 'other', cellHash: 'abc', line: 2 })).toBe(false);
  });

  test('rejects a negative line', () => {
    expect(isToggleTaskMessage({ type: 'toggleTask', cellHash: 'abc', line: -1 })).toBe(false);
  });

  test('rejects a fractional line', () => {
    expect(isToggleTaskMessage({ type: 'toggleTask', cellHash: 'abc', line: 1.5 })).toBe(false);
  });

  test('rejects a missing cell hash', () => {
    expect(isToggleTaskMessage({ type: 'toggleTask', line: 0 })).toBe(false);
  });

  test('rejects a non-object', () => {
    expect(isToggleTaskMessage('toggleTask')).toBe(false);
  });
});
