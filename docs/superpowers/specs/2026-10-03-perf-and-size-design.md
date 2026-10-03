# Performance and Correctness Review — Design

Date: 2026-10-03
Status: approved

## Context

A review of `sigula` v1.0.2 was requested with the goal of improving runtime
performance, with bundle/source size as a secondary concern.

Baseline measured at the start of this work:

| Metric | Value |
| --- | --- |
| `dist/sigula.js` | 11.02 kB minified |
| `dist/sigula.js` gzipped | 4.07 kB |
| npm tarball (unpacked) | 98.5 kB |
| Source (excluding tests) | ~1000 lines across 14 modules |
| Test suite | 66 tests, 9 files, all passing |
| `pnpm typecheck` | clean |

## Method

Every candidate optimisation was benchmarked before being proposed, so that the
plan contains only measured wins. happy-dom is roughly three orders of magnitude
slower than a real browser DOM and exhausts the heap on large clone loops, so it
was used only for correctness instrumentation and pure-JS timing, never for
DOM-operation timing.

Two hypotheses were measured and **rejected**:

| Hypothesis | Measurement | Decision |
| --- | --- | --- |
| Inline `at()` at `repeat.ts` hot-loop call sites | 45% **slower** than the helper (1.80 → 2.61 us/op); V8 inlines it | rejected, keep `at()` |
| Order-insensitive `Set` equality (drops two `Array.from` allocations) | 15% **slower** (0.98 → 1.14 us/op for 100 elements) | rejected, keep current semantics |

## Accepted changes

### 1. `eq.ts` — cross-type equality bug fix

**Problem.** `isEqual` ends with a plain-object fallback that compares only
`Object.keys`. `Object.keys` returns `[]` for `Date`, `Map`, `Set`, `RegExp`,
`Error` and `[]`. When the `instanceof` guards above the fallback fail to match
because only one side is of that type, control falls through to the key
comparison and dissimilar values compare equal:

```
isEqual(new Date(5), {}) => true      isEqual([], {})              => true
isEqual(new Map(), {})    => true      isEqual({}, [])              => true
isEqual(new Set(), {})    => true      isEqual(/a/, {})              => true
isEqual(new Error('x'), {}) => true     isEqual(new Date(0), [])     => true
```

All of the above are symmetric.

**Impact.** `isEqual` is public API and gates every `Sig.update`. A signal whose
value changes shape has its write silently swallowed and never notifies its
observers:

```ts
const s = sig<unknown>({});
render(html`<p>${text(s)}</p>`, host);
// host.textContent === '[object Object]'
s.update([]);
// host.textContent === '[object Object]'  -- stale, should be ''
```

**Fix.** Add one guard immediately before the plain-object fallback:

```ts
if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
```

Everything above it (`Equatable`, `Array`, `Date`, `RegExp`, `Map`, `Set`) is
untouched, so same-type semantics are unchanged. Verified across 20 same-type
pairs with zero behavioural differences, and across 14 cross-type pairs of which
13 were returning `true` and now return `false`.

The fourteenth, `isEqual([1, 2], {0: 1, 1: 2, length: 2})`, was already `false`
— `Object.keys` omits `length` on arrays — and stays `false`.

The guard is free on the hot path:

| Case | Before | After |
| --- | --- | --- |
| plain object | 0.093 us/op | 0.093 us/op |
| scalar | 0.014 us/op | 0.007 us/op |
| 50-object array | 0.305 us/op | 0.304 us/op |

**Also in this change (speedup).** Delete two provably unreachable lines:

- `eq.ts:61` `if (Object.is(a, b)) return true;` — `a === b` at `:17` already
  returned for identical references and for `-0`/`0`; `NaN` never reaches here
  because `:20` excludes non-objects. So `Object.is` can only ever agree with
  the check that already returned.
- `eq.ts:62` `if (!isRecord(a) || !isRecord(b)) return false;` — `:20` has
  already established both values are non-null objects, so the guard is always
  false.

Deleting `:62` orphans the module-local `isRecord` helper, and `tsconfig.json`
sets `noUnusedLocals: true`, so it must be deleted too. Keep the exported
`UnknownRecord` type: it is documented public API in the README's low-level
section even though its only in-repo consumer was `isRecord`.

Drop the redundant `typeof value === 'object' && value !== null` prefix from
`isEquatable` — its single call site at `:22` is already past the `:20` guard.

Switch the `Object.keys` loop from `for...of` to an index loop to avoid an
iterator allocation per object comparison.

Public API is unchanged: same exports, same signatures.

### 2. `eq.test.ts` — characterization suite

`eq.ts` is 74 lines of recursive code gating every signal write and currently
has one test with two assertions. The new suite is split by intent.

**Pinned to current behaviour** — these must not change:

- primitives: `1`/`1` → true, `1`/`2` → false, `'a'`/`'a'` → true,
  `1`/`'1'` → false
- `null`/`null` → true, `undefined`/`undefined` → true,
  `null`/`undefined` → false, `null`/`{}` → false
- `-0`/`0` → true (`===` at `:17` returns first)
- `NaN`/`NaN` → **false** (bails at `:20`, since `typeof NaN !== 'object'`).
  This is a separate latent wart — `NaN` never equals itself — but it is out of
  scope for this change. The pin test records it deliberately so a future fix is
  a conscious decision rather than an accident.
- nested arrays and objects, including deep mixes
- `Date` by `getTime()`, `RegExp` by `toString()`
- `Map` by size plus key/recursive-value equality
- `Set` — **including the current insertion-order sensitivity**, where
  `isEqual(new Set([1,2]), new Set([2,1]))` is `false`
- custom `Equatable` objects via `equals()`, including a cross-implementation
  `equals` that returns `true`
- key-count mismatch (`{a:1}` vs `{a:1,b:2}`), missing own property
  (`{a:1}` vs `{b:1}`)
- null-prototype objects (`Object.create(null)`)

**Asserted as corrected** — the 13 cross-type pairs listed above, expecting
`false`.

### 3. `repeat.ts` — in-place track update (4.0x)

`repeat.ts:341-347` `_setTrack` returns `{...old, checked: false, cleaned: false}`
when an item is unchanged, allocating one object per unchanged row per update.
Measured at 7.34 us/op for 500 unchanged tracks.

Change it to reset the two flags on `old` and return `old`.

Measured at 1.82 us/op for the same 500 tracks — **4.0x faster**.

**Safety argument.** All five call sites in `repeatCmd` assign the result into
the fresh `newTracks` array, and `ctx.tracks = newTracks` replaces the old array
at the end of the same synchronous pass, so no aliasing survives the call. Every
site advances its cursor past the index it just mutated, so the
`ctx.tracks[oldHead].checked` reads at `:119`/`:123` are unaffected. The
map-lookup branch at `:213` re-sets `oldTrack.checked = true` immediately after
`_setTrack`, and `:233` therefore still observes the flag it expects. This is
also exercised by the existing test "still updates a track that was reused as-is
by an earlier reorder".

**New tests** in `repeat.test.ts` pinning the `checked`/`cleaned` bookkeeping:

- no bind leak after a reorder that reuses tracks as-is
- no double-clean (would throw or remove a reused boundary)
- complete teardown of every track after reorder, insert and remove

### 4. `sig.bind.ts` — single recompute on `DerivedSig` re-arm

`sig.bind.ts:150-154` rebuilds each upstream bind and immediately runs its
command, so a derived signal over N sources recomputes N times on every re-arm.
Measured: 10 invocations of the compute function for a 10-source record.

Every source's command derives the target from *all* sources, so a single run
after all binds are registered observes every current value.

Change `addBind` to map all fresh binds first, assign them to `_fromBinds`, then
invoke exactly one command. The `super.addBind`-must-stay-first constraint
documented at `sig.bind.ts:142` is preserved, since all binds are registered
before any recompute.

**New test** in `sig.bind.test.ts` asserting the compute function is invoked
exactly once on re-arm for a multi-source record.

### 5. `html.ts` — bitmask template shape (2.5x)

`html.ts:43-47` `_shape` builds a string on every `html()` call to key the
template cache. Measured 0.025 us/op.

Return a bitmask number for up to 31 interpolations and fall back to the current
string beyond that. `Tpl.shape` becomes `number | string`; the existing
`===` comparison at `:131` works for both, so there is no new interpolation
limit and no extra branch on the hot path. Measured 0.010 us/op — **2.5x**.

Templates with more than 31 interpolations keep working exactly as today.

### 6. Dead code removal

No bundle impact; reduces the surface a reader has to hold.

- `src/live.ts` — 12 lines. `LIVE`, `LiveBoundary` and `liveBoundary` are
  imported by nothing. `view.ts` and `repeat.ts` declare their `live` getter
  inline as `() => Boundary | undefined`. Fully dead; already tree-shaken.
- `src/cmd.ts.bk`, `src/compute.ts.bk`, `src/live.ts.bk`, `src/sig.ts.bk` —
  437 lines of stale editor backups, gitignored via `*.bk`.
- `src/boundary.ts` — 14 lines of commented-out `Range`-based alternatives in
  `removeBoundary` and `replaceWithNode`.
- `src/sig.bind.ts:125` — commented-out `console.log` in the empty
  `Sig.cleanup()` hook, which must stay as the `DerivedSig` override point.
- `src/compute.ts:26` — commented-out `// source: Sig<S>`.

`Sig.cleanup()` stays: it is an empty hook whose only purpose is to be the
`DerivedSig` override point, so removing the body would break the override.

## Out of scope

- **`html` cache-hit slot lookup.** On a template cache hit, `_scan` still
  TreeWalker-walks the cloned tree even though slot positions are known —
  measured at 122 `nextNode()` calls to locate 1 slot in a 162-node template.
  Storing a `childNodes`-index path per slot would reduce this to O(depth).
  Declined during review as too invasive for the benefit; available as future
  work.
- **Dropping `dist/sigula.js.map`.** It is 56.2 kB, 60% of the npm tarball, but
  consumers need it for readable stack traces.
- **Bundling `README.md` into the tarball.** 21.2 kB, but npm always renders it.
- **Inlining `at()`** and **order-insensitive `Set` equality** — both measured
  slower, see Method.

## Sequencing

Each step is committed separately and leaves the suite green, so a regression can
be bisected to a single change.

1. Dead code removal (mechanical, no behaviour change)
2. `html.ts` `_shape` bitmask
3. `eq.test.ts` characterization suite — commit as tests-only, still green
4. `eq.ts` guard, dead-line removal, indexed loop — the suite from step 3 is the
   safety net
5. `repeat.test.ts` bookkeeping tests, then `repeat.ts` in-place update
6. `sig.bind.test.ts` re-arm count test, then `sig.bind.ts` single recompute
7. README size claim corrected to the measured 4.07 kB gzip
8. Final verification

## Verification

Per step: run the new tests red, make the change, run the full suite green.

Final gate:

```
pnpm typecheck && pnpm test && pnpm build
```

Then re-run the five benchmarks used to justify this design and confirm each
still meets or beats its target:

| Change | Target |
| --- | --- |
| `repeat` 500 unchanged tracks | ≤ 2.5 us/op (from 7.34) |
| `DerivedSig` re-arm, 10 sources | 1 compute call (from 10) |
| `isEqual` scalar fast path | ≤ 0.008 us/op (from 0.014) |
| `isEqual` plain object | ≤ 0.10 us/op (unchanged) |
| `html` `_shape` | ≤ 0.012 us/op (from 0.025) |

The 66 pre-existing tests must remain passing and unmodified except for
additions.