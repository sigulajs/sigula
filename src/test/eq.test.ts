import {describe, expect, it} from 'vitest';
import {isEqual} from '#/eq.js';

describe('isEqual', () => {
  it('number', () => {
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual(1, 1)).toBe(true);
  });
});
