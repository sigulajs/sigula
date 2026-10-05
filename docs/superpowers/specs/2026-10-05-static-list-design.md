# Static lists with `list`

Date: 2026-10-05

## Motivation

`repeat` handles reactive, keyed lists: it takes a `Sig<T[]>` and reconciles
DOM nodes by key. For a fixed array known at render time, that machinery is
unnecessary — there is nothing to reconcile. Today such a list is written by
mapping to views and interpolating them individually, which is awkward and does
not communicate intent:

```ts
html`<ul>${items.map((item) => html`<li>${text(item)}</li>`)}</ul>`;
```

A dedicated static list renders a fixed array in order and reads like the map it
replaces:

```ts
html`<ul>${list(items, (item) => html`<li>${text(item)}</li>`)}</ul>`;
```

This is the second of five proposed API ergonomics changes and is deliberately
static: no keyed reconciliation, no reactive source.

## API

```ts
export const list = <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
): View;
```

- `items` is a plain `readonly T[]`; `Sig` sources are out of scope (use
  `repeat`).
- `viewFn` receives the item and its 0-based index and must return an `AnyView`.
  Returning a primitive is not auto-wrapped; normalization stays scoped to
  `html` interpolations.

## Design

### Construction

`list` maps `items` in order, calling `viewFn(item, index)` for each and
appending `.node` to a `DocumentFragment`. This mirrors `repeat`'s `_init`, minus
keys and tracks. The result is a `View`:

- `node`: the `DocumentFragment`;
- `boundary: () => boundary`, where `boundary` is `toBoundary(frag)` computed
  **before** the fragment is inserted (insertion empties the fragment, so a lazy
  `toBoundary(frag)` would later throw `E2`);
- `cleanBinds`: calls `cleanBinds()` on every generated child view.

The generated views are kept in a local array so teardown is complete and no new
data structure is introduced. `list` creates no bind of its own, so it needs no
`RepeatContext`-style object.

### Empty input

An empty `items` produces a fragment containing a single `<!--empty-list-->`
comment, matching `repeat([])`. This exists for two reasons: `toBoundary` throws
`E2` on an empty fragment, and the placeholder keeps `list([])` renderable and
distinguishable in the DOM. `viewFn` is never called for an empty array.

### Reactivity

`list` is static and never re-renders. Any reactivity comes from the `AnyView`s
`viewFn` returns — for example a nested `view(...)`, or a `text(sig)`. Those views
are built once and cleaned up via `list`'s `cleanBinds`; their own bind lifecycles
are unchanged.

### Interactions

- In an `html` content position, `commitView` replaces the marker comment with
  the fragment, splicing the list's nodes into place.
- As a `render` root, `render` appends the fragment and disposes via the
  precomputed boundary; the boundary nodes are the fragment's first/last child
  objects, which do not change when the fragment is inserted.
- `list` does not set `children` on its `View`; like `repeat`, it manages
  teardown over its own array.

### What does not change

`repeat`, `html`, `text`, `view`, the bind queue, and the boundary helpers are
untouched. No new error codes: empty input is handled by the placeholder comment,
and `list` has no keyed-command guards.

## Testing

Create `src/test/list.test.ts`:

- renders items in source order and passes the correct 0-based index;
- a reactive `view`/`text` inside an item updates after the microtask flush;
- `list([], viewFn)` renders `<!--empty-list-->` and does not call `viewFn`;
- disposing a `list` (through `render`) clears nested binds
  (`sig.getBinds().length === 0`);
- `list` in an `html` content position keeps following siblings.

Also add a type-level check that a `readonly` array is accepted (a
`ReadonlyArray<T>` argument compiles).

## Docs

Add a `list` subsection to the README's Control flow section, next to `repeat`:
signature, a static example, the `readonly` requirement, the
`<!--empty-list-->` output, and a pointer to `repeat` for reactive/keyed lists.

## Acceptance criteria

1. `list(items, viewFn)` renders one view per item, in order, with the correct
   index.
2. `list([])` renders `<!--empty-list-->` without calling `viewFn`.
3. Nested reactive views update through their own signals and detach when the
   list is disposed.
4. `list` works inside `html` and as a `render` root without disturbing
   surrounding nodes.
5. `pnpm test` and `pnpm typecheck` pass.
