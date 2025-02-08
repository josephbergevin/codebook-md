import { describe, it } from 'mocha';
import { expect } from 'chai';
import { toUpper } from '../fmt';

describe('toUpper', () => {
  it('should convert a string to uppercase', () => {
    const result = toUpper('hello');
    expect(result).to.equal('HELLO');
  });

  // Additional test cases can be added here
});
