# Teardown correctness: DerivedSig re-arm, html arity guard, render disposer

Date: 2026-10-03

## Problem

Three defects in the exported API's teardown and cache-trust behaviour, found while
auditing the public surface. Each was reproduced against the current code before any
change was designed.

### 1. `DerivedSig` is permanently dead after its first detach

`DerivedSig.cleanup()` severs the links to its source signals as soon as its observer
count reaches zero (`src/sig.bind.ts:136`). Observer count routinely returns to zero
and then goes back up — any subtree hidden by `view()` unsubscribes, and re-showing it
re-subscribes. But the links were destroyed, not suspended, so the derived signal never
tracks its sources again.

Real use case: a collapsible order-summary panel whose counts come from `compute`.
The user collapses the panel, edits the cart while it is collapsed, and re-opens it.

```
CURRENT                                  expected
1. panel open    items 2  $6            items 2  $6
2. collapses    (collapsed)             (collapsed)
3. adds 5 teas  items 2  $6     <-      items 7  $16
4. edits qty    items 2  $6     <-      items 8  $18
```

The damage is not limited to the first render after re-show. The derived never
resubscribes at all, so every later edit stays frozen too (step 4).

### 2. Re-subscribing alone is insufficient

`createBind` only subscribes; it never invokes `cmd`. A derived that re-arms after its
sources have moved keeps serving the value it held when it was last live. In the
collapsed-panel case the data always changes *while hidden*, so re-subscribing alone
cannot produce a correct first render.

```
n=9 while detached  doubled = 10   (resubscribed, never recomputed; should be 18)
n=10 afterwards    doubled = 20   (later updates do work)
```

The fix therefore needs both halves: rebuild the upstream links *and* recompute once
from current source values. This mirrors what `commitPatch` already does at mount time
(`src/html.ts:71` runs `cmd`, then `createBind`).

### 3. `html` trusts `items` without checking arity

Driving a foreign `TemplateStringsArray` through an extracted tag corrupts the DOM
silently in both directions. `_text` does `strs[i + 1] ?? ''`, so too few items truncate
trailing static markup; and `_scan`'s loop condition `itemIndex < items.length` stops
early, so the `wraps.length !== items.length` guard at `src/html.ts:157` never trips
when there are too many.

```
slots = 1,  tpl(strs)          ->  <p></p>     no error
slots = 1,  tpl(strs, a, b)    ->  <p>a</p>b   no error   (extra items leak marker nodes)
```

Reachable from JavaScript, and from TypeScript behind a cast: `html`'s inferred type is
`(strs, ...items) => View`, so `const tpl = html` is not callable in TS but is at runtime.

### 4. No way to unmount a rendered tree

`render` returns `void` (`src/render.ts:3`). Nothing tears down the root view, so its
binds are retained for the lifetime of the signals they observe. Measured: 100
mount-then-`remove()` cycles left 100 live binds on one signal. `cleanCommit` is
exported, but a caller would have to reassemble the commit tree by hand.

This cannot be fixed before Problem 1 is fixed: a mount -> dispose -> mount cycle is
exactly the path that currently kills derived signals.

## Design

Three independent changes, landed in this order. Problems 1 and 2 are both fixed by
Change 1; Problem 3 by Change 2; Problem 4 by Change 3.

### Change 1 — `DerivedSig` re-armable subscription

`src/sig.bind.ts`. `_fromBinds` becomes both the live link list and the recipe book; a
`_linked` flag records whether the recipes are currently applied.

```ts
export class DerivedSig<T> extends Sig<T> {
  private _fromBinds: AnyBind[] = [];
  private _linked = true;

  addFromBind<S, C extends CmdContext>(bind: Bind<S, C>) {
    this._fromBinds.push(bind);
  }

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

  override cleanup() {
    if (!this._linked) return;
    this._linked = false;
    for (const b of this._fromBinds) removeBind(b);
  }
}
```

Properties this relies on, each verified:

- `cleanup()` is reached only from `Sig.removeBind` when observer count hits zero
  (`src/sig.bind.ts:115`), so it only ever fires on a >=1 -> 0 transition. A `compute`
  result read through `.get()` with no renderer never had a bind, so never has a
  removal, and stays eagerly subscribed. Current behaviour is preserved.
- Stale `Bind` objects cannot be reused: `removeBind` sets `removed = true`, and
  `Queue.flush` skips removed binds (`src/sig.bind.ts:49`). Pushing them back makes the
  source *look* subscribed while silently dropping every update. Hence rebuilding fresh
  binds from each recipe's own `sig` / `context` / `cmd`.
- A `Bind` already carries `sig`, `context`, and `cmd`, so no parallel `_from` array is
  needed.
- Chains work because `createBind` calls `addBind` on the *source*, so a
  derived-of-a-derived re-arms its own upstream through the same override.
- The `_linked` guard makes `cleanup()` idempotent, which Change 3 relies on.

`compute` is not modified, and `addFromBind` keeps its exact signature, so the public
`.d.ts` is unchanged. (An earlier draft renamed `addFromBind` to `addFrom(source, ctx,
cmd)` and added a separate `_from` array; both were withdrawn as unnecessary.)

### Change 2 — arity guard

`src/html.ts`. One check before the cache lookup:

```ts
const slots = strs.length - 1;
if (items.length !== slots) {
  throw new Error(
    `html: expected ${slots} interpolation${slots === 1 ? '' : 's'}, got ${items.length}`,
  );
}
```

TypeScript cannot check this: the `TemplateStringsArray` handed to a tag is not a tuple
of known length, so arity is only available at runtime.

### Change 3 — disposer

`View` carries one internal, symbol-keyed getter reporting the boundary currently
backing that view. `src/view.ts`:

```ts
const LIVE = Symbol('sigula.liveBoundary');   // deliberately not exported

export interface View<T = unknown, C extends CmdContext = any> {
  type: 'view';
  node: Node;
  bind?: Bind<T, C> | undefined;
  childCommits?: Commit<unknown, CmdContext>[];
  [LIVE]?: () => Boundary | undefined;
}

export const liveBoundary = (v: AnyView): Boundary | undefined => v[LIVE]?.();
```

Each producer supplies its own:

| producer  | getter                                | rationale |
| --------- | ------------------------------------- | --------- |
| `html`    | eagerly captured from the fragment    | the fragment is emptied by `appendChild`, so capture must happen while it still has children; `frag.firstChild ? toBoundary(frag) : undefined` keeps `html\`\`` from throwing |
| `view`    | `() => ctx.boundary`                  | the same field `viewCmd` already mutates on every swap, so it tracks live content |
| `repeat`  | `() => ctx.boundary`                  | likewise, mutated by `repeatCmd` |

`src/render.ts`:

```ts
export const render = (
  viewArg: AnyView | (() => AnyView),
  node: Node,
): (() => void) => {
  const view = typeof viewArg === 'function' ? viewArg() : viewArg;
  const boundary = liveBoundary(view);
  node.appendChild(view.node);
  const commit: Commit<unknown, CmdContext> = {
    binds: view.bind,
    children: view.childCommits,
  };
  return () => {
    cleanCommit(commit);
    if (boundary) removeBoundary(boundary);
  };
};
```

Details that matter:

- **`view()` must set the getter after the spread.** It returns `{...view, bind}`, so a
  nested `html` view's getter would otherwise be inherited — stale, because it points at
  the inner fragment `view` has already replaced. `{...view, bind, [LIVE]: () =>
  ctx.boundary}` puts the live one last so it wins.
- **Double-dispose is safe.** `cleanCommit` re-removing an already-removed bind is a
  no-op (`indexOf` -> -1, and Change 1's `_linked` guard stops a repeat `cleanup()`), and
  `removeBoundary` early-returns when `start.parentNode` is null.
- Reading `boundary` before `appendChild` is required for `html`, and harmless for
  `view`/`repeat`, whose contexts already hold a boundary at construction time.
- Returning a value from `render` is backwards compatible: existing callers that ignore
  it are unaffected, and it composes with the thunk form where the caller never holds
  the `View`.

## Testing

All work follows red-green. Each test is written first and watched to fail for the
expected reason.

### Change 1

1. `view()` hide -> change source while hidden -> show yields current values (the
   four-step order-summary case above).
2. After re-show, a further edit still propagates (step 4 of that case).
3. `compute` with no observer stays live across an unrelated source update.
4. `compute(compute(...))` re-arms both levels.
5. `cleanup()` twice leaves no duplicate source binds.

### Change 2

6. Too few items throws the arity message.
7. Too many items throws the arity message.

### Change 3

8. Disposer detaches every bind in the tree and empties the container.
9. Root `render(view(sig, ...), node)`: after the sig flips, dispose removes the
   post-swap nodes.
10. Double-dispose is a no-op.
11. `html\`\`` renders and disposes without throwing.
12. Disposer works with the thunk form of `render`.

## Out of scope

Raised during the audit, deliberately not addressed here:

- Export-surface curation: sealing `View`, trimming `Sig` / `DerivedSig` internals, a
  `./internal` subpath, dropping the `Any*` aliases, normalising `Commit.binds` to an
  array, naming the unexported `ViewContext` / `RepeatContext` types.
- `flushSync` / `batch`, `effect(fn)`.
- `attr()` key typing, inconsistent with the validated `style()` key.
- `repeat` friction: mandatory `key`, and deep `isEqual` as the default per-item
  comparator.
- The `patch()`-in-child-position error message reads "unmatched interpolation", which
  is indirect for that case.

## Risks

- Change 3 grows the public `View` interface with a symbol-keyed optional member. The
  symbol is not exported, so callers cannot set it and hand-written `View` objects
  remain valid.
- Change 1 makes re-observation recompute synchronously inside `addBind`, which runs
  during `createBind`. This is the same re-entrancy shape `commitPatch` already uses at
  mount, and the value is recomputed before any observer is queued.
- Both `view()` and `repeat()` read `ctx.boundary`, coupling their dispose behaviour to
  those context shapes. That coupling already exists through `replaceWithView`, and the
  symbol-keyed getter localises it to the two producers that own a mutable boundary.