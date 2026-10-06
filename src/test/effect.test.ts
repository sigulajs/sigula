import {beforeEach, describe, expect, it} from 'vitest';
import {effect, sig} from '..';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('effect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('runs immediately with the current value', () => {
    const s = sig(1);
    const seen: number[] = [];
    effect(s, (v) => seen.push(v));
    expect(seen).toEqual([1]);
  });

  it('runs once per flush with the final value', async () => {
    const s = sig(0);
    const seen: number[] = [];
    effect(s, (v) => seen.push(v));

    s.update(1);
    s.update(2);
    s.update(3);
    await flush();

    expect(seen).toEqual([0, 3]);
  });

  it('supports a record of signals and coalesces', async () => {
    const a = sig(1);
    const b = sig(2);
    const seen: Array<[number, number]> = [];
    effect({a, b}, (v) => seen.push([v.a, v.b]));

    expect(seen).toEqual([[1, 2]]);

    a.update(10);
    b.update(20);
    await flush();

    expect(seen).toEqual([
      [1, 2],
      [10, 20],
    ]);
  });

  it('stops after dispose', async () => {
    const s = sig(0);
    const seen: number[] = [];
    const dispose = effect(s, (v) => seen.push(v));

    s.update(1);
    await flush();
    dispose();

    s.update(2);
    await flush();

    expect(seen).toEqual([0, 1]);
  });

  it('dispose is idempotent', () => {
    const s = sig(0);
    const dispose = effect(s, () => {});
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it('record dispose removes the internal source binds', async () => {
    const a = sig(1);
    const b = sig(2);
    const dispose = effect({a, b}, () => {});
    expect(a.getBinds().length).toBe(1);

    dispose();
    await flush();
    expect(a.getBinds().length).toBe(0);
    expect(b.getBinds().length).toBe(0);
  });
});
