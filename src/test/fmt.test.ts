import { describe, it, expect } from '@jest/globals';
import { toUpper } from '../fmt';

describe('toUpper', () => {
  it('should convert a string to uppercase', () => {
    const result = toUpper('hello');
    expect(result).toBe('HELLO');
  });

  // Additional test cases can be added here
});
