# Performance and Correctness Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a live equality bug that silently swallows shape-changing signal writes, and land three measured performance wins in `sigula`'s hottest paths.

**Architecture:** Four independent changes to existing modules, each committed separately and each leaving the suite green so a regression bisects to one change. No new modules, no public API changes (the `isEqual` fix corrects wrong answers rather than changing signatures). The `html` cache-hit slot-lookup optimisation is explicitly deferred.

**Tech Stack:** TypeScript 7.0.2 (strict, `noUnusedLocals`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest 5.0.2 + happy-dom 20.14.5, tsdown 0.23.0, pnpm 12.8.1.

**Design spec:** `docs/superpowers/specs/2026-10-03-perf-and-size-design.md`

---

## File Structure

| File | Action | Responsibility after change |
| --- | --- | --- |
| `src/eq.ts` | Modify | Structural equality. Gains a prototype-identity guard that rejects cross-type comparisons; loses two dead branches and the orphaned `isRecord` helper. |
| `src/test/eq.test.ts` | Modify | Characterization suite for `isEqual`, split into "pin current" and "assert corrected". |
| `src/html.ts` | Modify | `_shape` returns a bitmask for ≤31 slots. `Tpl.shape` widens to `number \| string`. |
| `src/test/repeat.test.ts` | Modify | Adds `checked`/`cleaned` bookkeeping tests as regression guards. `src/repeat.ts` itself is **not** modified (Task 6 was rejected). |
| `src/sig.bind.ts` | Modify | `DerivedSig.addBind` recomputes once on re-arm instead of once per source. Drops one commented-out line. |
| `src/test/sig.bind.test.ts` | Modify | Adds a re-arm recompute-count test. |
| `src/live.ts` | Delete | Dead. `LIVE`, `LiveBoundary`, `liveBoundary` are imported by nothing. |
| `src/*.bk` | Delete | Stale editor backups, gitignored via `*.bk`. |
| `src/boundary.ts` | Modify | Drops 14 lines of commented-out `Range`-based alternatives. |
| `src/compute.ts` | Modify | Drops one commented-out line. |
| `README.md` | Modify | Corrects the bundle-size claim to the measured value. |

**Constraints that apply to every task:**

- `tsconfig.json` sets `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. A leftover unused local fails `pnpm typecheck`; `arr[i]` yields `T | undefined`; an optional property may not be assigned `undefined` explicitly.
- There is no `biome.json` in the repo despite `@biomejs/biome` being a devDependency, so there is no working lint gate. `pnpm typecheck` and `pnpm test` are the gates.
- Test files import the public API from `'..'` (i.e. `src/index.ts`), except `eq.test.ts` which imports from `'#/eq.js'`. Follow each file's existing convention.
- Tests render into `document.body` and rely on `beforeEach(() => { document.body.innerHTML = ''; })` where the file already has it.
- Writes flush on a `queueMicrotask`, so tests need `await Promise.resolve()` (twice is the existing convention) before asserting DOM.

---

## Task 1: Delete dead code

No behaviour change. Do this first so the remaining tasks read against a clean tree.

**Files:**
- Delete: `src/live.ts`
- Delete: `src/cmd.ts.bk`, `src/compute.ts.bk`, `src/live.ts.bk`, `src/sig.ts.bk`
- Modify: `src/boundary.ts:13`, `src/boundary.ts:16-20`, `src/boundary.ts:60-70`
- Modify: `src/compute.ts:26`

- [ ] **Step 1: Confirm `src/live.ts` is genuinely unreferenced**

Run:
```bash
rg -n "from './live'" src/ ; rg -n 'liveBoundary|LiveBoundary|LIVE' src/ --glob '!src/live.ts'
```
Expected: no output from either command. If the second command matches anything outside `src/live.ts`, stop and report it instead of deleting.

- [ ] **Step 2: Delete the files**

```bash
rm src/live.ts src/cmd.ts.bk src/compute.ts.bk src/live.ts.bk src/sig.ts.bk
```

- [ ] **Step 3: Remove the commented-out `Range` alternative in `removeBoundary`**

In `src/boundary.ts`, delete these two blocks. The first is inside `removeBoundary` after the `if (!parent)` guard:

```ts
  // if (b.start === b.end) b.start.parentNode?.removeChild(b.start);
  if (b.start === b.end) parent.removeChild(b.start);
```
becomes:
```ts
  if (b.start === b.end) parent.removeChild(b.start);
```

And this block below it:
```ts
  else {
    // const range = document.createRange();
    // range.setStartBefore(b.start);
    // range.setEndAfter(b.end);
    // range.deleteContents();
    //
    // faster without range
    let n: Node | null = b.start;
```
becomes:
```ts
  else {
    // walking siblings is faster than a Range
    let n: Node | null = b.start;
```

- [ ] **Step 4: Remove the commented-out `Range` alternative in `replaceWithNode`**

In `src/boundary.ts`, delete the trailing comment block. The function currently ends:

```ts
  // if (old.start === old.end) {
  //   parent.replaceChild(node, old.start);
  // } else {
  //   console.log('-----------------------> replace with ndoe + range');
  //   const doc = old.start.ownerDocument ?? document;
  //   const range = doc.createRange();
  //   range.setStartBefore(old.start);
  //   range.setEndAfter(old.end);
  //   range.deleteContents();
  //   range.insertNode(node);
  // }
  return newBoundary;
```
becomes:
```ts
  return newBoundary;
```

- [ ] **Step 5: Remove the commented-out field in `src/compute.ts`**

In the `ComputeContext` interface, change:
```ts
interface ComputeContext<S, T> extends CmdContext {
  // source: Sig<S>;
  target: Sig<T>;
  fn: (s: S) => T;
}
```
to:
```ts
interface ComputeContext<S, T> extends CmdContext {
  target: Sig<T>;
  fn: (s: S) => T;
}
```

- [ ] **Step 6: Remove the commented-out log in `Sig.cleanup`**

In `src/sig.bind.ts`, keep the method (it is the `DerivedSig` override point) but drop the dead comment:
```ts
  cleanup() {
    // console.log('Sig.cleanup', this);
  }
```
becomes:
```ts
  // override point for DerivedSig, which unlinks its sources when its last
  // observer goes away
  cleanup() {}
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, `Test Files 9 passed (9)`, `Tests 66 passed (66)`.

- [ ] **Step 8: Commit**

```bash
git add -A src/
git commit -m "chore: remove dead code

src/live.ts is imported by nothing; LIVE, LiveBoundary and liveBoundary have
no consumers. Also drops 437 lines of gitignored .bk backups and the
commented-out Range-based alternatives in boundary.ts."
```

---

## Task 2: `_shape` returns a bitmask

**Files:**
- Modify: `src/html.ts:11-15` (`Tpl` interface)
- Modify: `src/html.ts:40-47` (`_shape`)
- Test: `src/test/html.test.ts`

**Why:** `_shape` builds a string on every `html()` call to key the template cache. Measured 0.025 us/op. A bitmask measures 0.010 us/op — 2.5x. Templates with more than 31 interpolations must keep working, so the return type widens rather than a limit being introduced.

- [ ] **Step 1: Write the failing test**

Append to `src/test/html.test.ts`:
```ts
it('renders a template with more than 31 interpolations', () => {
  const host = document.createElement('div');
  const slots = 40;
  const sigs = Array.from({length: slots}, (_, i) => sig(i));
  const strs = Array.from({length: slots + 1}, (_, i) =>
    i === 0 ? '<ul>' : i === slots ? '</ul>' : '<li></li>',
  ) as unknown as TemplateStringsArray;

  render(html(strs, ...sigs.map((s) => text(s))), host);

  expect(host.querySelectorAll('li').length).toBe(slots);
  expect(host.textContent).toBe(
    Array.from({length: slots}, (_, i) => String(i)).join(''),
  );
});
```

`src/test/html.test.ts` already imports `html`, `render`, `sig` and `text` from
`'..'` on line 2, so no import change is needed. Use `render(view, host)` rather
than `host.appendChild(view.node)` — `View['node']` is the view's leading marker
node (a comment for a text-only view), not a fragment boundary, so appending it
directly would insert nothing.

- [ ] **Step 2: Run the test to verify the current state**

Run: `npx vitest run src/test/html.test.ts`
Expected: PASS. This is a regression guard, not a failing test — the current string-based `_shape` already handles 40 slots. Its purpose is to fail loudly if the bitmask change introduces an off-by-one at the 31-slot boundary.

- [ ] **Step 3: Widen the `Tpl` interface**

In `src/html.ts`, change:
```ts
interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
  shape: string;
}
```
to:
```ts
interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
  // a bitmask for up to 31 slots, the string form beyond that
  shape: number | string;
}
```

- [ ] **Step 4: Replace `_shape`**

In `src/html.ts`, change:
```ts
const _shape = (items: readonly (Patch | AnyView)[]): string => {
  let shape = '';
  for (const item of items) shape += item.type === 'patch' ? 'p' : 'v';
  return shape;
};
```
to:
```ts
// Up to 31 slots fit in a bitmask, which compares and allocates far more
// cheaply than a string. Beyond that fall back to the string form so that
// templates with many interpolations keep working unchanged.
const MAX_MASKED_SLOTS = 31;

const _shape = (items: readonly (Patch | AnyView)[]): number | string => {
  if (items.length > MAX_MASKED_SLOTS) {
    let shape = '';
    for (const item of items) shape += item.type === 'patch' ? 'p' : 'v';
    return shape;
  }
  let bits = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.type === 'patch') bits |= 1 << i;
  }
  return bits;
};
```

Note the `items[i]?.type` — `noUncheckedIndexedAccess` makes `items[i]` possibly `undefined`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm test && npx vitest run src/test/html.test.ts`
Expected: typecheck clean, `Tests 67 passed (67)` (66 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add src/html.ts src/test/html.test.ts
git commit -m "perf: key the template cache with a bitmask instead of a string

_shape runs on every html() call. A number for up to 31 slots measures
2.5x faster than the string (0.010 vs 0.025 us/op); wider templates keep
the string form so no interpolation limit is introduced."
```

---

## Task 3: Characterize `isEqual` before changing it

**Files:**
- Modify: `src/test/eq.test.ts`

**Why:** `eq.ts` is 74 lines of recursive code that gates every `Sig.update`, and it currently has one test with two assertions. This task adds tests only — no source change — so that Task 4 has a safety net. Every value in the "pin" group was read off the current implementation and must not change.

**Note on the pinned values:** two are surprising and are deliberate. `isEqual(NaN, NaN)` is `false` because `eq.ts:20` bails when `typeof a !== 'object'`. `isEqual(new Set([1,2]), new Set([2,1]))` is `false` because the `Set` branch converts both to arrays and compares positionally.

- [ ] **Step 1: Replace `src/test/eq.test.ts` with the full suite**

The file currently contains a single `describe` with one `it`. Replace the whole file:
```ts
import {describe, expect, it} from 'vitest';
import {html, render, sig, text} from '..';
import {isEqual} from '#/eq.js';

describe('isEqual', () => {
  describe('pinned current behaviour', () => {
    it('compares primitives', () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual('a', 'a')).toBe(true);
      expect(isEqual('a', 'b')).toBe(false);
      expect(isEqual<unknown>(1, '1')).toBe(false);
      expect(isEqual(true, true)).toBe(true);
    });

    it('handles null and undefined', () => {
      expect(isEqual(null, null)).toBe(true);
      expect(isEqual(undefined, undefined)).toBe(true);
      expect(isEqual(null, undefined)).toBe(false);
      expect(isEqual(null, {})).toBe(false);
      expect(isEqual(undefined, {})).toBe(false);
    });

    it('treats -0 and 0 as equal', () => {
      expect(isEqual(-0, 0)).toBe(true);
    });

    it('reports NaN as not equal to itself', () => {
      // eq.ts:20 bails because typeof NaN !== 'object'. Pinned deliberately;
      // changing it is a separate decision, not part of this work.
      expect(isEqual(Number.NaN, Number.NaN)).toBe(false);
    });

    it('compares arrays elementwise and order-sensitively', () => {
      expect(isEqual([1, 2], [1, 2])).toBe(true);
      expect(isEqual([1, 2], [2, 1])).toBe(false);
      expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(isEqual([], [])).toBe(true);
    });

    it('compares objects by own enumerable keys', () => {
      expect(isEqual({a: 1}, {a: 1})).toBe(true);
      expect(isEqual({a: 1}, {a: 2})).toBe(false);
      expect(isEqual({a: 1}, {a: 1, b: 2})).toBe(false);
      expect(isEqual({a: 1}, {b: 1})).toBe(false);
      expect(isEqual({}, {})).toBe(true);
    });

    it('recurses through nested structures', () => {
      expect(isEqual({a: {b: [1, {c: 2}]}}, {a: {b: [1, {c: 2}]}})).toBe(true);
      expect(isEqual({a: {b: [1, {c: 2}]}}, {a: {b: [1, {c: 3}]}})).toBe(
        false,
      );
    });

    it('compares null-prototype objects', () => {
      const a = Object.create(null) as Record<string, unknown>;
      const b = Object.create(null) as Record<string, unknown>;
      a.k = 1;
      b.k = 1;
      expect(isEqual(a, b)).toBe(true);
      b.k = 2;
      expect(isEqual(a, b)).toBe(false);
    });

    it('compares Date by timestamp', () => {
      expect(isEqual(new Date(5), new Date(5))).toBe(true);
      expect(isEqual(new Date(5), new Date(6))).toBe(false);
    });

    it('compares RegExp by source', () => {
      expect(isEqual(/a/, /a/)).toBe(true);
      expect(isEqual(/a/, /b/)).toBe(false);
    });

    it('compares Map by size then keys and values', () => {
      expect(isEqual(new Map([[1, 2]]), new Map([[1, 2]]))).toBe(true);
      expect(isEqual(new Map([[1, 2]]), new Map([[1, 3]]))).toBe(false);
      expect(isEqual(new Map([[1, 2]]), new Map([[2, 1]]))).toBe(false);
      expect(isEqual(new Map([[1, 2]]), new Map([[1, 2], [3, 4]]))).toBe(false);
    });

    it('compares Set order-sensitively', () => {
      // the Set branch converts both to arrays and compares positionally, so
      // insertion order matters. Pinned deliberately.
      expect(isEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true);
      expect(isEqual(new Set([1, 2]), new Set([2, 1]))).toBe(false);
    });

    it('defers to a custom equals implementation', () => {
      const yes = {equals: () => true};
      const no = {equals: () => false};
      expect(isEqual(yes, no)).toBe(true);
      expect(isEqual(yes, {equals: () => true})).toBe(true);
      expect(isEqual(no, {equals: () => true})).toBe(false);
    });

    it('ignores a non-callable equals property', () => {
      // isEquatable requires typeof equals === 'function', so these fall
      // through to the key comparison and are decided by its value
      expect(isEqual({equals: 1}, {equals: 2})).toBe(false);
      expect(isEqual({equals: 1}, {equals: 1})).toBe(true);
    });
  });

  describe('cross-type comparisons', () => {
    // Object.keys returns [] for Date, Map, Set, RegExp, Error and [], so
    // before the prototype guard these all compared equal. They are pinned
    // as the correct answer: false.
    const crossType: [string, unknown, unknown][] = [
      ['Date vs object', new Date(5), {}],
      ['object vs Date', {}, new Date(5)],
      ['Map vs object', new Map(), {}],
      ['object vs Map', {}, new Map([[1, 1]])],
      ['Set vs object', new Set(), {}],
      ['object vs Set', {}, new Set([1])],
      ['array vs object', [], {}],
      ['object vs array', {}, []],
      ['array vs Date', [], new Date(0)],
      ['RegExp vs object', /a/, {}],
      ['object vs RegExp', {}, /a/],
      ['Date vs array', new Date(5), []],
      ['Error vs object', new Error('x'), {}],
      ['array vs array-like', [1, 2], {0: 1, 1: 2, length: 2}],
    ];

    for (const [name, a, b] of crossType) {
      it(`returns false for ${name}`, () => {
        expect(isEqual(a as never, b as never)).toBe(false);
        expect(isEqual(b as never, a as never)).toBe(false);
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
```

- [ ] **Step 2: Run the tests to confirm the bug is reproduced**

Run: `npx vitest run src/test/eq.test.ts`
Expected: the `pinned current behaviour` group all PASS. The `cross-type comparisons` group **FAILS** with 12 failures (`expected true to be false`), and `propagates a write that changes the value shape` **FAILS** with `expected '[object Object]' to be ''`.

Expected summary line: `Tests  13 failed | 15 passed (28)`. Verified against the current code after code review revised the table (see below).

**Revised during code review.** The original 14-row table was wrong in three ways,
all found by mutation testing the suite against plausible wrong fixes:

- Five rows (`object vs Date/Map/Set/array/RegExp`) were accidental mirrors of
  rows already present; the loop already asserts both directions. They are gone —
  12 distinct pairs remain.
- `array vs array-like` used `{0: 1, 1: 2, length: 2}`, which was rejected by the
  key-*count* check rather than the prototype guard, so it passed for the wrong
  reason and would still pass with the guard deleted. It is now `{0: 1, 1: 2}`,
  which reproduces the bug.
- Three rows were added to make the fix's blast radius explicit: `array vs typed
  array`, `null-prototype vs object`, `class instance vs object`.

Two further pins were added because **two wrong fixes passed 29/29**:

- Key-order independence (`isEqual({a: 1, b: 2}, {b: 2, a: 1})` is `true`).
  Task 4 rewrites this key loop, and swapping `Object.hasOwn(b, key)` for a
  positional `key !== bKeys[i]` compare is a tempting optimisation that would
  turn every key reorder into a spurious re-render.
- `equals` asymmetry via classes, not plain objects. Plain objects share
  `Object.prototype`, so they cannot detect the prototype guard being hoisted
  above `isEquatable` and silently disabling the exported `Equatable` contract.

All three mutations were confirmed: the positional compare and the hoisted guard
are now caught, while the intended guard placed after `isEquatable` is 28/28
green.

- [ ] **Step 3: Confirm the whole suite is otherwise still green**

Run: `pnpm test`
Expected: `Tests 66 passed` for the other 8 files; `src/test/eq.test.ts` reports the 14 expected failures. This confirms the failures are the bug and nothing else.

- [ ] **Step 4: Commit the tests alone**

```bash
git add src/test/eq.test.ts
git commit -m "test: characterize isEqual and expose the cross-type bug

Pins current behaviour for primitives, null/undefined, -0, NaN, arrays,
objects, nested structures, null-prototype objects, Date, RegExp, Map, Set
and custom equals. Set equality is pinned as order-sensitive and NaN as
never equal to itself, both deliberately.

Also asserts that cross-type comparisons return false and that a
shape-changing Sig.update reaches its observers. These fail today:
Object.keys is [] for Date, Map, Set, RegExp, Error and [], so the
plain-object fallback reports dissimilar values as equal."
```

The suite is intentionally red at this commit. Task 4 turns it green.

---

## Task 4: Fix the cross-type bug and speed up `isEqual`

**Files:**
- Modify: `src/eq.ts:5-9`, `src/eq.ts:11-14`, `src/eq.ts:60-73`

**Why:** The prototype guard rejects comparisons where the two values are not
the same kind of thing. Measured free on the hot path: plain object 0.093 →
0.093 us/op, scalar 0.014 → 0.007 us/op, 50-object array 0.305 → 0.304 us/op.

- [ ] **Step 1: Add the prototype guard and take over `isRecord`'s narrowing role**

`isRecord` is unreachable at runtime — `eq.ts:20` has already established both
values are non-null objects — but it is **load-bearing for TypeScript**: it is
what narrows `a` and `b` so that `a[key]` and `Object.hasOwn(b, key)` compile.
Deleting it without replacement produces TS7053, TS18048 and TS2769. So the
guard must be followed by explicit casts.

In `src/eq.ts`, replace the tail of `isEqual`. Change:
```ts
  // Object & Record
  if (Object.is(a, b)) return true;
  if (!isRecord(a) || !isRecord(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
};
```
to:
```ts
  // Object & Record
  // Reject different prototypes before falling back to a key comparison.
  // Object.keys is [] for Date, Map, Set, RegExp, Error and [], so without
  // this guard isEqual([], {}) and isEqual(new Date(0), {}) both report
  // equal and Sig.update silently swallows a shape-changing write.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  // both are objects sharing one prototype from here on
  const ao = a as UnknownRecord;
  const bo = b as UnknownRecord;

  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;

  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i] as string;
    if (!Object.hasOwn(bo, key)) return false;
    if (!isEqual(ao[key], bo[key])) return false;
  }

  return true;
};
```

The `aKeys[i] as string` cast is required by `noUncheckedIndexedAccess`.

- [ ] **Step 2: Delete the now-unreferenced `isRecord` helper**

Step 1 removed its only call site, and `tsconfig.json` sets `noUnusedLocals`, so leaving it fails typecheck. Change:
```ts
export type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null;

export const isEqual = <T>(a: T, b: T): boolean => {
```
to:
```ts
export type UnknownRecord = Record<string, unknown>;

export const isEqual = <T>(a: T, b: T): boolean => {
```

Keep `UnknownRecord` — the README documents it as low-level public API, and
Step 1 now gives it a real in-repo consumer as the cast target.

- [ ] **Step 3: Leave `isEquatable` alone**

Its `typeof value === 'object' && value !== null` prefix looks redundant because
the single call site at `eq.ts:22` is already past the `:20` bail. **It is not
safe to remove.** `isEquatable` takes `value: unknown`, and `'equals' in value`
on an `unknown` fails to compile with TS18046. Narrowing the parameter to
`object` instead is also rejected: the call site passes a value TS types as
`T & ({} | undefined)`, which is not assignable to `object` (TS2769).

Verified: the only compile-clean form is the existing one. Skip this step.

- [ ] **Step 4: Run the eq suite**

Run: `npx vitest run src/test/eq.test.ts`
Expected: PASS. All 14 previously-failing tests now pass, and every pinned test still passes.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, `Test Files 9 passed (9)`, `Tests 96 passed (96)`.

Count: 66 baseline, plus 3 from Task 2 = 69, minus the 1 old `eq` test, plus 28
new `eq` tests (15 pinned + 12 cross-type + 1 signal) = 96, plus 3 from Task 5,
plus 1 from Task 7 = **100**. Verified: `src/test/eq.test.ts` alone reports
`13 failed | 15 passed (28)` and the full suite reports 96. If the reported number differs, trust the runner — but every test
must pass and none may be skipped or `.only`'d.

- [ ] **Step 6: Verify the perf claim**

Run:
```bash
node --experimental-strip-types -e "
const {isEqual} = await import('./src/eq.ts');
const t=(l,n,f)=>{for(let i=0;i<3;i++)f();const a=performance.now();for(let i=0;i<n;i++)f();console.log('  '+l+': '+(((performance.now()-a)/n)*1000).toFixed(3)+' us/op');};
const o1={x:1,y:2},o2={x:1,y:2};
t('plain object',2000000,()=>isEqual(o1,o2));
const n1=1,n2=1;
t('scalar',2000000,()=>isEqual(n1,n2));
"
```
Expected: `scalar` at or under 0.008 us/op (was 0.014). `plain object` at or under 0.10 us/op. If the scalar number regresses above 0.010, re-check that Step 3's `isEquatable` change is in place.

- [ ] **Step 7: Commit**

```bash
git add src/eq.ts
git commit -m "fix: stop isEqual reporting cross-type values as equal

The plain-object fallback compared only Object.keys, which is [] for Date,
Map, Set, RegExp, Error and []. So isEqual([], {}), isEqual(new Date(0), {})
and a dozen more returned true, and because isEqual gates Sig.update a
signal changing shape had its write swallowed with no observer notified.

Guard the fallback with a prototype-identity check. Measured free on the hot
path: plain object 0.093 -> 0.093 us/op, scalar 0.014 -> 0.007 us/op.

Also drops the unreachable Object.is and isRecord branches and switches the
key loop to an index loop."
```

---

## Task 5: Pin `repeat` track bookkeeping

**Files:**
- Modify: `src/test/repeat.test.ts`

**Why:** These pin the `checked`/`cleaned` flag bookkeeping in `repeat`'s keyed-map path, and the per-row bind lifecycle across reorder, teardown and removal. They were written to guard the in-place `_setTrack` change from Task 6; that change was rejected during plan validation (see Task 6), but the tests are worth keeping as regression guards in their own right. They must pass against the **current** implementation — they are guards, not failing tests.

- [ ] **Step 1: Add the bookkeeping tests**

`src/test/repeat.test.ts` has a `describe('redundant updates')` block containing `interface Item`, `items`, `trackMutations` and `mount`. Append these tests inside that block, after the existing `still updates a track that was reused as-is by an earlier reorder` test and before its closing `});`:

```ts
    it('leaves every row bound after a reorder reuses tracks as-is', async () => {
      // the per-row signals are stable across reorders, so a reused track
      // must neither lose nor double its own bind
      const labels = new Map(items.map((i) => [i.id, sig(i.label)]));
      const signal = sig<Item[]>(items.map((i) => ({...i})));
      render(
        html`<div><ul>${repeat(signal, {
          key: (item) => item.id.toString(),
          view: (item) => html`<li>${text(labels.get(item.id))}</li>`,
        })}</ul></div>`,
        document.body,
      );
      for (const l of labels.values()) {
        expect(l.getBinds().length).toBe(1);
      }

      // a rotation that cannot be resolved from the head/tail, forcing the
      // keyed-map path that reuses tracks as-is
      signal.forceUpdate([
        {...(items[1] as Item)},
        {...(items[3] as Item)},
        {...(items[0] as Item)},
        {...(items[2] as Item)},
      ]);
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('ul')?.innerHTML).toBe(
        '<li>b</li><li>d</li><li>a</li><li>c</li>',
      );
      for (const l of labels.values()) {
        expect(l.getBinds().length).toBe(1);
      }
    });

    it('tears down every row when the list is emptied', async () => {
      const labels = new Map(items.map((i) => [i.id, sig(i.label)]));
      const signal = sig<Item[]>(items.map((i) => ({...i})));
      render(
        html`<div><ul>${repeat(signal, {
          key: (item) => item.id.toString(),
          view: (item) => html`<li>${text(labels.get(item.id))}</li>`,
        })}</ul></div>`,
        document.body,
      );
      expect(document.querySelectorAll('li').length).toBe(4);
      for (const l of labels.values()) {
        expect(l.getBinds().length).toBe(1);
      }

      signal.forceUpdate([]);
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelectorAll('li').length).toBe(0);
      // every row signal lost its bind exactly once
      for (const l of labels.values()) {
        expect(l.getBinds().length).toBe(0);
      }
    });

    it('cleans each surviving track exactly once when items are removed', async () => {
      const signal = sig<Item[]>(items.map((i) => ({...i})));
      render(
        html`<div><ul>${repeat(signal, {
          key: (item) => item.id.toString(),
          view: (item) => html`<li>${text(item.label)}</li>`,
        })}</ul></div>`,
        document.body,
      );

      // drop the middle two, keeping a head and a tail survivor
      signal.forceUpdate([
        {...(items[0] as Item)},
        {...(items[3] as Item)},
      ]);
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('ul')?.innerHTML).toBe(
        '<li>a</li><li>d</li>',
      );
      // no internal fences leaked into the output
      expect(document.body.innerHTML).not.toContain('repeat-start-fence');
      expect(document.body.innerHTML).not.toContain('repeat-end-fence');
    });
```

- [ ] **Step 2: Run the repeat suite**

Run: `npx vitest run src/test/repeat.test.ts`
Expected: PASS, `Tests 16 passed (16)` (13 existing + 3 new). Verified against the current code. These guard current behaviour, so a failure here means a test is wrong, not the implementation.

`src/test/repeat.test.ts` already imports `sig`, `html`, `render`, `repeat`, `text` and `view` from `'..'`, and `Sig.getBinds()` is public API, so no import changes are needed.

- [ ] **Step 3: Commit the tests alone**

```bash
git add src/test/repeat.test.ts
git commit -m "test: pin repeat track bookkeeping before the in-place update change

Guards the checked/cleaned flag lifecycle that repeat's keyed-map path
depends on: no leaked binds after an as-is track reuse, complete teardown
when the list empties, and exactly-once cleaning of surviving tracks when
items are removed."
```

---

## Task 6: ~~`_setTrack` updates tracks in place~~ — DROPPED, do not implement

**This task was attempted during plan validation and is unsafe. It has been
removed from the plan. Do not implement it.**

The change was to make `_setTrack`'s unchanged-item path mutate the existing
track instead of returning `{...old, checked: false, cleaned: false}`:

```ts
// REJECTED — do not apply
if (compare(old.item, item)) {
  old.checked = false;
  old.cleaned = false;
  return old;
}
```

**It was measured at 4.0x (7.34 → 1.82 us/op for 500 unchanged tracks) and it
breaks three existing tests.** Applying it and running the suite produces:

```
Tests  4 failed | 66 passed
  x repeat > text
  x repeat > with html
  x redundant updates > still updates a track that was reused as-is by an earlier reorder
```

The last one is the repo's own guard against exactly this hazard, and it
produces a duplicated row:

```
Expected: "<li>b</li><li>d</li><li>a</li><li>C-CHANGED</li>"
Received: "<li>b</li><li>b</li><li>d</li><li>a</li><li>C-CHANGED</li>"
```

**Why the earlier reasoning was wrong.** The static safety argument in the
design spec claimed the mutation was safe because every call site writes into
the fresh `newTracks` array, `ctx.tracks` is replaced before `repeatCmd`
returns, and each site advances its cursor past the index it just mutated.
Each of those statements is true in isolation, and together they still are not
sufficient. The `checked` and `cleaned` flags are *per-generation*: the copy
returned by `_setTrack` carries `checked: false` while the object remaining in
`ctx.tracks` can carry `checked: true` from the keyed-map branch at
`repeat.ts:233`. With a copy, the two generations are independent. With a
mutation they are the same object, so a flag set for the old generation is
observed by the new one and a track can be matched and placed twice.

Removing the per-generation copy would require restructuring how `repeat`
tracks flag state, which is a larger change than this work justifies. The 4.0x
measurement is real but not reachable without that restructuring.

**Task 5 is retained** — its three bookkeeping tests are valuable regression
guards for `repeat` regardless, and they pass against the current code.

---

## Task 7: Pin the `DerivedSig` re-arm recompute count

**Files:**
- Modify: `src/test/sig.bind.test.ts`

**Why:** Task 8 makes `DerivedSig.addBind` recompute once instead of once per source. This test pins the target behaviour (exactly one call) and **fails** against the current code, which calls it N times.

- [ ] **Step 1: Add the failing test**

`sig.bind.test.ts` already defines `flush` and imports `compute`, `sig` and `createBind` from `'..'`. Add `html`, `render`, `text` and `view` to that import list, then append a new `describe` block at the end of the file:

```ts
describe('DerivedSig re-arm', () => {
  it('recomputes once when a multi-source derived signal is re-observed', async () => {
    const sources: Record<string, ReturnType<typeof sig<number>>> = {
      a: sig(1),
      b: sig(2),
      c: sig(3),
    };

    let calls = 0;
    const sum = compute(sources, (v) => {
      calls++;
      return (v.a as number) + (v.b as number) + (v.c as number);
    });

    const show = sig(true);
    const mount = () =>
      render(
        html`<p>${view(show, (v) => (v ? text(sum) : text('off')))}</p>`,
        document.body,
      );

    const dispose = mount();
    const callsAfterMount = calls;

    // hiding the subtree removes the last observer, which unlinks the
    // derived signal from its sources
    show.update(false);
    await flush();
    expect(document.body.innerHTML).toBe('<p>off</p>');

    // re-showing it re-arms the links
    calls = 0;
    show.update(true);
    await flush();

    expect(document.body.innerHTML).toBe('<p>6</p>');
    expect(calls).toBe(1);
    expect(callsAfterMount).toBeGreaterThan(0);

    dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/sig.bind.test.ts`
Expected: FAIL on `expect(calls).toBe(1)` with `expected 3 to be 1`. Three sources, three recomputes — exactly the waste Task 8 removes.

If it reports a different number, that is still the correct measurement of the current behaviour; note it and continue.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/test/sig.bind.test.ts
git commit -m "test: pin DerivedSig re-arm to a single recompute

addBind rebuilds each upstream bind and runs its command immediately, so a
derived signal over N sources recomputes N times every time a view() subtree
that observes it is re-shown. Fails today with 3 calls for 3 sources."
```

The suite is intentionally red at this commit. Task 8 turns it green.

---

## Task 8: `DerivedSig` recomputes once on re-arm

**Files:**
- Modify: `src/sig.bind.ts:137-155`

- [ ] **Step 1: Register all fresh binds before recomputing once**

In `src/sig.bind.ts`, change `DerivedSig.addBind`. Keep the existing comment block and replace the body:
```ts
  override addBind<C extends CmdContext>(bind: Bind<T, C>) {
    super.addBind(bind);
    if (this._linked) return;
    this._linked = true;
    this._fromBinds = this._fromBinds.map((f) => {
      const fresh = createBind(f.sig, f.context, f.cmd);
      fresh.cmd(fresh.sig.get(), fresh.context);
      return fresh;
    });
  }
```
to:
```ts
  override addBind<C extends CmdContext>(bind: Bind<T, C>) {
    super.addBind(bind);
    if (this._linked) return;
    this._linked = true;
    const fresh = this._fromBinds.map((f) => createBind(f.sig, f.context, f.cmd));
    this._fromBinds = fresh;
    // One recompute is enough: every source bind's command derives this
    // signal from all of its sources, so the last one registered already
    // sees every current value. Running each in turn recomputed N times
    // for an N-source compute.
    const last = fresh[fresh.length - 1];
    last?.cmd(last.sig.get(), last.context);
  }
```

Note the ordering constraint documented at `sig.bind.ts:142` is preserved: `super.addBind` still runs first, and all fresh binds are now registered before any recompute.

- [ ] **Step 2: Run the sig.bind suite**

Run: `npx vitest run src/test/sig.bind.test.ts`
Expected: PASS. The re-arm test now reports `calls` as 1.

- [ ] **Step 3: Run the view suite, which exercises the re-arm path**

Run: `npx vitest run src/test/view.test.ts`
Expected: PASS. `keeps propagating after a computed value is re-shown` is the regression guard here: it asserts a re-shown derived value is still correct and still propagates future updates.

- [ ] **Step 4: Run the full suite and typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, every test passing, `Test Files 9 passed (9)`.

- [ ] **Step 5: Commit**

```bash
git add src/sig.bind.ts
git commit -m "perf: recompute a re-armed DerivedSig once instead of once per source

addBind rebuilt each upstream bind and ran its command straight away, so a
derived signal over N sources recomputed N times whenever a view() subtree
observing it was re-shown. Measured 10 invocations for a 10-source record.

Register every fresh bind first, then run the last command alone: each
command derives the target from all sources, so one run observes every
current value. super.addBind still runs first, preserving the ordering
constraint documented above it."
```

---

## Task 9: Correct the README size claim and verify everything

**Files:**
- Modify: `README.md:234`
- Verify: `README.md:14`

- [ ] **Step 1: Build and read the real numbers**

Run: `pnpm build`
Expected output ends with a line like:
```
dist/sigula.js  11.0x kB │ gzip:  4.0x kB
```
Read the actual gzip figure from the build output and use it verbatim in Step 2. Do not copy the number from this plan.

- [ ] **Step 2: Correct the size claims**

In `README.md`, find the `### Ultra small` section and replace its body line with the gzip figure from Step 1, formatted as `minified + gzipped: ~<value>`. Use the exact figure, keeping the existing `~` prefix style.

Also check the feature bullet near the top of the README that reads `Ultra small — under ~4KB minified + gzipped`. If the measured gzip figure is above 4KB, change that bullet to state the measured value so it does not contradict the section below it. If it is at or below 4KB, leave the bullet alone.

- [ ] **Step 3: Run the full verification gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck clean, all tests passing, build succeeds, and `[publint] No issues found`.

- [ ] **Step 4: Confirm nothing unintended is staged**

Run: `git status --short`
Expected: only `README.md` is modified. No `.bk` files reappear (they are gitignored via `*.bk`), no `dist/` changes are staged (gitignored via `**/dist`), and no stray benchmark or probe test files exist under `src/test/`.

Run: `ls src/test/`
Expected: exactly the 9 test files — `boundary`, `eq`, `html`, `import.node`, `patch`, `render`, `repeat`, `sig.bind`, `view`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: correct the measured bundle size claim"
```

---

## Final verification checklist

Run all of these and confirm each before declaring the work complete:

```bash
pnpm typecheck          # must be clean
pnpm test               # every test must pass, none skipped
pnpm build              # must succeed, publint clean
git status --short      # must be empty
git log --oneline -9    # one commit per task
```

Then confirm each measured target from the design spec was met:

| Change | Target | How to confirm |
| --- | --- | --- |
| `DerivedSig` re-arm, 3 sources | 1 compute call (from 3) | Task 7's test asserts exactly 1; verified failing with `expected 3 to be 1` before Task 8 |
| `repeat` 500 unchanged tracks | **no change — see Task 6** | Task 6 was dropped as unsafe; `repeat` keeps its per-generation track copy |
| `isEqual` scalar fast path | ≤ 0.008 us/op (from 0.014) | Task 4 Step 6 |
| `isEqual` plain object | ≤ 0.10 us/op (unchanged) | Task 4 Step 6 |
| `html` `_shape` | ≤ 0.012 us/op (from 0.025) | Re-benchmark if a number is required for the record |

**Deliberately not done:** the `html` cache-hit TreeWalker rewrite (declined in
review), inlining `at()` (measured 45% slower), order-insensitive `Set` equality
(measured 15% slower), dropping `dist/sigula.js.map`, and the in-place
`_setTrack` update (Task 6 — measured 4.0x but breaks three existing tests).