import { isCopyTextMessage, isRequestSettingsMessage, isSettingsMessage } from '../../notebookRenderer/protocol';

describe('isCopyTextMessage', () => {
  test('accepts a copyText message', () => {
    expect(isCopyTextMessage({ type: 'copyText', text: 'echo hi' })).toBe(true);
  });

  test('accepts empty text', () => {
    expect(isCopyTextMessage({ type: 'copyText', text: '' })).toBe(true);
  });

  test('rejects non-string text', () => {
    expect(isCopyTextMessage({ type: 'copyText', text: 42 })).toBe(false);
  });
});

describe('isRequestSettingsMessage', () => {
  test('accepts a requestSettings message', () => {
    expect(isRequestSettingsMessage({ type: 'requestSettings' })).toBe(true);
  });

  test('rejects a different message type', () => {
    expect(isRequestSettingsMessage({ type: 'toggleTask' })).toBe(false);
  });

  test('rejects a non-object', () => {
    expect(isRequestSettingsMessage(undefined)).toBe(false);
  });
});

describe('isSettingsMessage', () => {
  test('accepts a well-formed settings message', () => {
    expect(isSettingsMessage({ type: 'settings', settings: { previewStyling: false } })).toBe(true);
  });

  test('rejects a message without settings', () => {
    expect(isSettingsMessage({ type: 'settings' })).toBe(false);
  });

  test('rejects a non-boolean previewStyling', () => {
    expect(isSettingsMessage({ type: 'settings', settings: { previewStyling: 'no' } })).toBe(false);
  });

  test('rejects a different message type', () => {
    expect(isSettingsMessage({ type: 'requestSettings', settings: { previewStyling: true } })).toBe(false);
  });
});
