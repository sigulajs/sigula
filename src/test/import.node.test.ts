// @vitest-environment node
import {describe, expect, it} from 'vitest';

describe('module import', () => {
  it('does not touch document at import time', async () => {
    expect(typeof document).toBe('undefined');

    const mod = await import('..');

    expect(mod.eq([1, 2], [1, 2])).toBe(true);
  });
});
