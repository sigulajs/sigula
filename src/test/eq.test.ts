import {describe, expect, it} from 'vitest';
import {eq, html, render, sig, text} from '..';

describe('isEqual', () => {
  describe('pinned current behaviour', () => {
    it('compares primitives', () => {
      expect(eq(1, 1)).toBe(true);
      expect(eq(1, 2)).toBe(false);
      expect(eq('a', 'a')).toBe(true);
      expect(eq('a', 'b')).toBe(false);
      expect(eq<unknown>(1, '1')).toBe(false);
      expect(eq(true, true)).toBe(true);
    });

    it('handles null and undefined', () => {
      expect(eq(null, null)).toBe(true);
      expect(eq(undefined, undefined)).toBe(true);
      expect(eq(null, undefined)).toBe(false);
      expect(eq(null, {})).toBe(false);
      expect(eq(undefined, {})).toBe(false);
    });

    it('treats -0 and 0 as equal', () => {
      expect(eq(-0, 0)).toBe(true);
    });

    it('reports NaN as not equal to itself', () => {
      // typeof NaN !== 'object', so the object path is never reached. Pinned
      // deliberately; changing it is a separate decision, not part of this work.
      expect(eq(Number.NaN, Number.NaN)).toBe(false);
    });

    it('compares arrays elementwise and order-sensitively', () => {
      expect(eq([1, 2], [1, 2])).toBe(true);
      expect(eq([1, 2], [2, 1])).toBe(false);
      expect(eq([1, 2], [1, 2, 3])).toBe(false);
      expect(eq([], [])).toBe(true);
    });

    it('compares objects by own enumerable keys', () => {
      expect(eq({a: 1}, {a: 1})).toBe(true);
      expect(eq({a: 1}, {a: 2})).toBe(false);
      expect(eq({a: 1}, {a: 1, b: 2})).toBe(false);
      expect(eq({a: 1}, {b: 1})).toBe(false);
      expect(eq({}, {})).toBe(true);
      // key order is not part of identity: JSON round-trips and spread merges
      // reorder keys routinely, and a positional key compare would turn every
      // reorder into a spurious re-render
      expect(eq({a: 1, b: 2}, {b: 2, a: 1})).toBe(true);
    });

    it('recurses through nested structures', () => {
      expect(eq({a: {b: [1, {c: 2}]}}, {a: {b: [1, {c: 2}]}})).toBe(true);
      expect(eq({a: {b: [1, {c: 2}]}}, {a: {b: [1, {c: 3}]}})).toBe(false);
    });

    it('compares null-prototype objects', () => {
      const a = Object.create(null) as Record<string, unknown>;
      const b = Object.create(null) as Record<string, unknown>;
      a.k = 1;
      b.k = 1;
      expect(eq(a, b)).toBe(true);
      b.k = 2;
      expect(eq(a, b)).toBe(false);
    });

    it('compares Date by timestamp', () => {
      expect(eq(new Date(5), new Date(5))).toBe(true);
      expect(eq(new Date(5), new Date(6))).toBe(false);
    });

    it('compares RegExp by source', () => {
      expect(eq(/a/, /a/)).toBe(true);
      expect(eq(/a/, /b/)).toBe(false);
    });

    it('compares Map by size then keys and values', () => {
      expect(eq(new Map([[1, 2]]), new Map([[1, 2]]))).toBe(true);
      expect(eq(new Map([[1, 2]]), new Map([[1, 3]]))).toBe(false);
      expect(eq(new Map([[1, 2]]), new Map([[2, 1]]))).toBe(false);
      expect(
        eq(
          new Map([[1, 2]]),
          new Map([
            [1, 2],
            [3, 4],
          ]),
        ),
      ).toBe(false);
    });

    it('compares Set order-sensitively', () => {
      // the Set branch converts both to arrays and compares positionally, so
      // insertion order matters. Pinned deliberately.
      expect(eq(new Set([1, 2]), new Set([1, 2]))).toBe(true);
      expect(eq(new Set([1, 2]), new Set([2, 1]))).toBe(false);
    });

    it('defers to a custom equals implementation', () => {
      class Yes {
        equals() {
          return true;
        }
      }
      class No {
        equals() {
          return false;
        }
      }
      // equals is read off the LEFT operand only, so the result is asymmetric:
      // isEqual(yes, no) is true while isEqual(no, yes) is false, because
      // eq.ts calls a.equals(b). Pinned deliberately — making it symmetric is a
      // separate decision, not part of this work.
      expect(eq(new Yes(), new No())).toBe(true);
      expect(eq(new Yes(), new Yes())).toBe(true);
      expect(eq(new No(), new Yes())).toBe(false);
    });

    it('ignores a non-callable equals property', () => {
      // isEquatable requires typeof equals === 'function', so these fall
      // through to the key comparison and are decided by its value
      expect(eq({equals: 1}, {equals: 2})).toBe(false);
      expect(eq({equals: 1}, {equals: 1})).toBe(true);
    });

    it('compares instances of the same class', () => {
      class P {
        x = 1;
      }
      expect(eq(new P(), new P())).toBe(true);
    });
  });

  describe('cross-type comparisons', () => {
    // Object.keys returns [] for Date, Map, Set, RegExp, Error, [], [] class
    // instances and typed arrays alike, so the plain-object fallback sees only
    // indices and reports dissimilar values as equal. Every row below is
    // currently true; the correct answer is false, and each fails for the
    // prototype-related reason it exists.
    //
    // Boxed primitives are deliberately absent: new Number(1) vs 1 is already
    // false via the typeof mismatch, and new Number(1) vs new Number(1) is
    // true both before and after the fix, so it would pin nothing. Boxed
    // primitives are a separate pre-existing gap, not something the prototype
    // guard handles.
    //
    // The last two rows close the shape-but-not-prototype gap. The
    // custom-prototype one is the only row that fails if the guard is weakened
    // to a.constructor !== b.constructor: that prototype inherits constructor
    // from Object.prototype, so the compare calls it equal to a plain object,
    // and with no own keys on either side the key compare then agrees. Two
    // distinct classes cannot catch it, since their constructors do differ.
    const crossType: [string, unknown, unknown][] = [
      ['Date vs object', new Date(5), {}],
      ['Date vs array', new Date(5), []],
      ['array vs Date', [], new Date(0)],
      ['Map vs object', new Map(), {}],
      ['Set vs object', new Set(), {}],
      ['RegExp vs object', /a/, {}],
      ['Error vs object', new Error('x'), {}],
      ['array vs object', [], {}],
      ['array vs array-like', [1, 2], {0: 1, 1: 2}],
      ['array vs typed array', [1, 2], new Uint8Array([1, 2])],
      [
        'null-prototype vs object',
        Object.assign(Object.create(null), {a: 1}),
        {a: 1},
      ],
      ['class instance vs object', new (class {})(), {}],
      ['class instance vs array', new (class {})(), []],
      [
        'two classes, same shape',
        new (class {
          x = 1;
        })(),
        new (class {
          x = 1;
        })(),
      ],
      ['custom prototype vs object', Object.create({}), {}],
    ];

    for (const [name, a, b] of crossType) {
      it(`returns false for ${name}`, () => {
        expect(eq(a as unknown, b as unknown)).toBe(false);
        expect(eq(b as unknown, a as unknown)).toBe(false);
      });
    }
  });

  describe('through Sig.update', () => {
    it('propagates a write that changes the value shape', async () => {
      const host = document.createElement('div');
      const s = sig<unknown>({});
      render(html`<p>${text(s)}</p>`, host);
      expect(host.textContent).toBe('[object Object]');

      s.update([]);
      await Promise.resolve();
      await Promise.resolve();
      expect(host.textContent).toBe('');
    });
  });
});
