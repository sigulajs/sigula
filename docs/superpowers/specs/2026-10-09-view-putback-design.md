# Reactive put-back for `view()`

Date: 2026-10-09

## Motivation

`view(sig, viewFn)` swaps one view for another when `sig` changes. Today the
swapped-out view is disposed with `cleanBinds()`, and the normal way to show it
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
2. **Dead reactivity.** Swapping out disposed the view's bindings, so a view put
   back rendered but no longer reacted to its signals.

Fix 1 is a targeted change to `replaceWithView`. Fix 2 is the subject of this
design.

## Concept: pause is not dispose

Split teardown into two operations:

- `detachBinds()` — remove the view's bindings from their signals but keep the
  bind objects (and keep `ref`/event cleanups). The hidden view stops reacting.
- `reattachBinds()` — re-add the same bind objects and run each once with the
  current value to catch up.
- `cleanBinds()` — permanent: detach, run cleanups, and latch disposed so a
  later reattach cannot resurrect it.

Reusing the bind objects matters: re-adding a bind to a `DerivedSig` already
runs its re-link/recompute path, so hidden derived chains keep their laziness
and still catch up when restored — exactly like today's fresh-view behavior.

`detachBinds` and `reattachBinds` are internal optionals on `View` (and
`Patch`), alongside the existing `committed?`. No public API changes.

## Behavior

### `viewCmd`

```ts
const newInner = ctx.viewFn(val);
if (newInner === ctx.inner) return; // guard: moving a boundary onto itself
const oldInner = ctx.inner;
const oldBoundary = oldInner.boundary();
replaceWithView(oldBoundary, newInner);
oldInner.detachBinds?.();   // was: oldInner.cleanBinds()
newInner.reattachBinds?.(); // no-op for a freshly built view
ctx.inner = newInner;
```

`view()`'s own `cleanBinds` (called only when the whole control-flow view is
disposed) is the permanent path.

### `replaceWithView`

If the target view is backed by an empty `DocumentFragment`, it has been mounted
before and its live nodes are its `boundary()`; move those into place instead of
the empty node. This is a put-back, not a second `commit`, so it does not raise
`E13` (which still guards template interpolation).

### Bind mechanics

A shared `bindLifecycle(binds, cleanups)` helper provides `detach`/`reattach`/
`dispose` for views that own a flat set of binds. `attached` starts true because
callers register binds before constructing the lifecycle. `reattach` resets
`removed`/`queued`, re-adds each bind to its signal, and runs its command once.

Event handlers (`on`) and `ref` are one-shot items, not binds, so reattach does
not double-register listeners or re-point a ref.

## Changes by file

| File | Change |
|---|---|
| `core/view.core.ts` | `detachBinds`/`reattachBinds` on `View`; fragment-aware `replaceWithView` |
| `core/patch.core.ts` | `detachBinds`/`reattachBinds` on `Patch` |
| `core/lifecycle.ts` | new internal `bindLifecycle` helper |
| `core/compose.ts` | recurse detach/reattach over child views |
| `html.ts` | `commitPatch` installs the lifecycle; view recurses over `children` |
| `text.ts`, `raw.ts` | wrap the single bind in the lifecycle |
| `view.ts` | `viewCmd` detach/reattach; own bind + `ctx.inner` recurse |
| `repeat.ts` | recurse over tracks + own bind; `_cleanTrack` stays permanent |

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

- `act` and `raw` re-run on resume, which is how they catch up; `act` callbacks
  should be idempotent (already the contract for `act`).
- A control-flow `view()` nested inside another and hidden mid-value-change
  reconciles by re-running `viewCmd` on resume, so a `viewFn` that returns fresh
  views rebuilds rather than restores. Functionally correct, slightly more work.
- A detached view that is never shown again keeps its refs pointed (cleanups run
  only on permanent dispose). This is the cost of allowing stable instances.
