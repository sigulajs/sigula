# Composing sibling views with `frag`

Date: 2026-10-05

## Motivation

There is no public way to group several views so they occupy one content slot.
A template can interpolate a single `View` per slot, and `list` only exists for
arrays. To render two sibling views in one position today you must nest them in
a wrapper element or an extra `html` template:

```ts
html`<div>${html`${text('a')}<b>${text('b')}</b>`}</div>`;
```

A fragment helper composes views directly, with no wrapper element:

```ts
html`<div>${frag(text('a'), html`<b>${text('b')}</b>`)}</div>`;
```

This is the fourth of five proposed API ergonomics changes.

## API

```ts
export const frag = (...views: AnyView[]): View;
```

- `views` is a list of `AnyView`s; primitives and `Sig`s are not auto-wrapped
  (normalization stays scoped to `html` interpolations).
- `frag` returns a content-position `View`; it is not valid in an attribute
  position.

## Design

### Composition

`frag` appends each `view.node` to a `DocumentFragment` in argument order. When a
child's `node` is itself a `DocumentFragment` — a nested `frag`, `list`, or
`html` — `appendChild` moves its children, so the result is one flat sibling
sequence with no redundant fragment nesting.

The returned `View`:

- `node`: the `DocumentFragment` (or the placeholder for empty input);
- `boundary`: derived lazily from the first and last child views, returning
  `{start: first.boundary().start, end: last.boundary().end}`. Deriving on demand
  — rather than capturing `toBoundary(frag)` at construction — keeps teardown
  correct when an edge `view()` swaps its root node, matching `list`;
- `cleanBinds`: calls `cleanBinds()` on every child view.

### Empty input

`frag()` returns a `View` whose `node` is a single empty `document.createTextNode('')`,
with boundary `{start: text, end: text}`. The text node renders nothing and gives
the view a valid boundary anchor, so no error code and no visible placeholder are
needed. `cleanBinds` is a no-op.

### Reactivity

`frag` is static; it creates no bind. Reactivity comes from the child views
(`view(...)`, `repeat(...)`, `raw(sig)`, `text(sig)`, ...), whose own bind
lifecycles are unchanged and which are torn down through `frag`'s `cleanBinds`.

### Interactions

- In an `html` content position, the marker comment is replaced by the
  fragment's children, splicing the composed nodes into place.
- As a `render` root, the fragment is appended and disposal uses the
  lazily derived boundary.
- Nesting is flat in the DOM: `frag(frag(a, b), c)` renders the same siblings as
  `frag(a, b, c)`.
- In a `view()` subtree, `cleanBinds` cleans the fragment's children when the
  subtree is hidden.

### What does not change

`list` keeps its own implementation and its `<!--empty-list-->` output; `frag`
does not replace or refactor it. No change to `html`, `text`, `view`, `repeat`,
`raw`, or anything in `core`. The only edit to an existing source file is adding
`export * from './frag';` to `src/index.ts`. No new error codes.

## Testing

Create `src/test/frag.test.ts`:

- composes mixed views in order (`text`, `html`, and a nested `frag`);
- works in an `html` content position and keeps following siblings;
- `frag()` renders nothing and does not throw;
- a reactive view inside a frag updates after the microtask flush;
- disposing a frag clears child binds (`sig.getBinds().length === 0`) and removes
  the nodes;
- an edge `view()` swap still tears down cleanly.

## Docs

Add a `frag` subsection to the README Control flow section, next to `list`: the
signature, an example, the no-wrapper flat-composition behavior, and the empty
case. Add `frag` to the existing View-producer enumerations in the `html` and
`View` sections.

## Acceptance criteria

1. `frag(...views)` renders the views as flat sibling nodes, in order, with no
   wrapper element.
2. `frag()` renders nothing and does not throw.
3. Child view reactivity works and disposal removes the child binds and nodes,
   including when an edge child swaps its node.
4. No existing source other than `src/index.ts` (`frag` export) is modified, and
   `pnpm test` / `pnpm typecheck` pass.
