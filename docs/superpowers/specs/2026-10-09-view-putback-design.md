# Reactive put-back for `view()`

Date: 2026-10-09

## Motivation

`view(sig, viewFn)` swaps one view for another when `sig` changes. Today the
swapped-out view is torn down with `cleanBinds()`, and the normal way to show it
again is to build a fresh view in `viewFn`. But authors also want to hold a
stable view instance and toggle it:

```ts
const shared = html`<b>${text(counter)}</b>`;
view(flag, (v) => (v ? shared : text('off')));
```

This exposed two bugs:

1. **Static crash.** An `html` view's `node` is a `DocumentFragment`. Mounting
   empties it, so putting the same instance back inserted an empty fragment and
   threw `E2` (swallowed by the bind flush).
2. **Dead reactivity.** Swapping out tore down the view's bindings, so a view put
   back rendered but no longer reacted to its signals.

Fix 1 is a targeted change to `replaceWithView`. Fix 2 is the subject of this
design.

## Concept: detach then reattach

A `View`/`Patch` has two lifecycle methods:

- `detach()` — removes the view's bindings from their signals, runs any command
  cleanups (e.g. `ref` resetting its `Sig` to `null`), and recursively detaches
  children. The bind objects are kept.
- `reattach()` — re-adds the same bind objects and runs each once with the
  current value to catch up.

There is no separate `dispose`: `detach` is both the hide and the permanent
teardown. It is idempotent, so a stale disposer stays a no-op. Reattaching the
same bind objects matters because re-adding a bind to a `DerivedSig` runs its
re-link/recompute path, so hidden derived chains keep their laziness and still
catch up when restored.

`detach` and `reattach` are required methods on `View` and `Patch` (replacing
`cleanBinds`). No other public API changes.

## Behavior

### `viewCmd`

```ts
const newInner = ctx.viewFn(val);
if (newInner === ctx.inner) return; // guard: moving a boundary onto itself
const oldInner = ctx.inner;
const oldBoundary = oldInner.boundary();
replaceWithView(oldBoundary, newInner);
oldInner.detach();
newInner.reattach(); // no-op for a freshly built view
ctx.inner = newInner;
```

### `replaceWithView`

If the target view is backed by an empty `DocumentFragment`, it has been mounted
before and its live nodes are its `boundary()`; move those into place instead of
the empty node. This is a put-back, not a second `commit`, so it does not raise
`E13` (which still guards template interpolation).

### Bind mechanics

Two stateless helpers, `detachBinds(owner, binds, cleanups)` and
`reattachBinds(owner, binds)`, own the flat bind-list loop. The `attached` flag
lives on the owner (`View`/`Patch`) and starts true because callers register binds
before constructing it. `detachBinds` removes the binds and runs the cleanups;
`reattachBinds` resets `removed`/`queued`, re-adds each bind to its signal, and
runs its command once. The public `detach()`/`reattach()` methods delegate to the
helpers; views with children recurse over them behind the same `attached` guard.

Commands register their teardown on `ctx.detach` (previously `ctx.cleanup`), which
`commitPatch` collects and runs from `detachBinds`. Event handlers (`on`) and
`ref` are one-shot items, not binds, so `reattach` does not re-run them and does
not double-register listeners.

## Changes by file

| File | Change |
|---|---|
| `core/view.core.ts` | `attached`/`detach`/`reattach` on `View`; fragment-aware `replaceWithView` |
| `core/patch.core.ts` | `attached`/`detach`/`reattach` on `Patch`; `ctx.cleanup` -> `ctx.detach` |
| `core/lifecycle.ts` | `detachBinds`/`reattachBinds` helpers + `Binder` |
| `core/compose.ts` | recurse detach/reattach over child views |
| `html.ts` | `commitPatch` installs the helpers; view recurses over `children` |
| `text.ts`, `raw.ts` | bind list passed to the helpers |
| `view.ts` | `viewCmd` detach/reattach; own bind + `ctx.inner` recurse |
| `repeat.ts` | recurse over tracks + own bind; `_cleanTrack` detaches |
| `render.ts` | disposer calls `view.detach()` |

## Testing

Added to `src/test/view.test.ts`:

- a shared `html` view with a `text` child stays reactive after put-back;
- it catches up to changes made while hidden;
- a shared view with a `patch` binding stays reactive after put-back;
- a shared `repeat` view keeps its track views reactive after put-back (forced
  through the unchanged-items bail path, proving the track reattach);
- a hidden nested control-flow view reconciles on put-back;
- the earlier static cases: fragment put-back, single-node put-back, and the
  self-swap guard.

Each new mechanism was verified to fail when its line is removed.

## Caveats

- `act` and `raw` re-run on reattach, which is how they catch up; `act`
  callbacks should be idempotent (already the contract for `act`).
- `ref` is a one-shot effect: it runs its cleanup (resetting the `Sig` to
  `null`) on detach, but `reattach` does not re-run it, so a `ref` inside a
  view that is hidden and re-shown stays `null`. Re-showing a view is expected
  to use reactive bindings, not `ref`, for anything that must survive the swap.
- A control-flow `view()` nested inside another and hidden mid-value-change
  reconciles by re-running `viewCmd` on resume, so a `viewFn` that returns fresh
  views rebuilds rather than restores. Functionally correct, slightly more work.
