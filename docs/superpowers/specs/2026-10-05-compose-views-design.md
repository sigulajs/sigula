# Extract `composeViews` for `frag` and `list`

Date: 2026-10-05

## Motivation

`frag` and `list` share the same non-empty body: build a `DocumentFragment` from
the child views, expose a lazily derived boundary (so an edge `view()` swap is
tracked), and `cleanBinds` every child. They differ only in the empty placeholder
(`frag()` renders an empty text node, `list([])` renders `<!--empty-list-->`) and
in how the view list is produced (arguments vs. `viewFn`). The duplicated body is
~25 lines and two copies of subtle lazy-boundary logic that must stay in sync.

## Design

### Internal helper

Add `src/core/compose.ts` with:

```ts
import {at} from './utils';
import {type AnyView, type View} from './view.core';

export const composeViews = (views: AnyView[], empty?: Node): View => {
  if (views.length === 0) {
    const node = empty ?? document.createTextNode('');
    return {
      type: 'view',
      node,
      boundary: () => ({start: node, end: node}),
      cleanBinds: () => {},
    };
  }

  const node = document.createDocumentFragment();
  views.forEach((view) => {
    node.appendChild(view.node);
  });

  return {
    type: 'view',
    node,
    // Derive the boundary from the child views on demand: an edge view() can
    // swap its root node, and a boundary captured at construction would point
    // at the detached old node, leaking on teardown.
    boundary: () => {
      const first = at(views, 0);
      const last = at(views, views.length - 1);
      return {start: first.boundary().start, end: last.boundary().end};
    },
    cleanBinds: () => {
      views.forEach((view) => {
        view.cleanBinds();
      });
    },
  };
};
```

`composeViews` is **internal**: it lives in a new module that is deliberately
**not** re-exported from `src/core/index.ts`, so it is not part of the public API
and does not appear in `Reference.md`. `frag.ts` and `list.ts` import it
directly from `./core/compose`.

### Thin public helpers

```ts
// frag.ts
export const frag = (...views: AnyView[]): View =>
  composeViews(views, views.length === 0 ? document.createTextNode('') : undefined);

// list.ts
export const list = <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
): View => {
  const views = items.map((item, index) => viewFn(item, index));
  return composeViews(
    views,
    views.length === 0 ? document.createComment('empty-list') : undefined,
  );
};
```

The empty placeholder is constructed only when the list is empty; non-empty calls
pass `undefined`, so there is no extra allocation on the common path.

`list` builds a `views` array and passes it to `composeViews` rather than calling
`frag(...views)`: spreading into a rest parameter would overflow the engine's
argument-count limit for very large lists (the same limit the queue's large-bind
test guards against).

### What does not change

- `frag` and `list` behavior, signatures, TSDoc, and their `Reference.md` entries.
- The public API surface: `composeViews` is not exported from the package.
- `at`, `View`, `AnyView`, and all other modules.

## Testing

The existing `frag` and `list` test suites already cover the shared behavior
(composition, nesting, lazy-boundary edge swaps, empty placeholder, teardown).
No new tests are required; `pnpm test` must stay green. Optionally add a `list`
test with a large array to document that composing does not spread, but this is
not required.

## Verification

- `pnpm test` and `pnpm typecheck` pass.
- `pnpm build` succeeds; report the gzip delta for `dist/sigula.js` (expected a
  small reduction from removing the duplicated body).
- `composeViews` does not appear in `dist/sigula.d.ts`.

## Acceptance criteria

1. `frag` and `list` are implemented on top of a single internal `composeViews`.
2. Behavior, signatures, and `Reference.md` are unchanged; `composeViews` is not
   part of the public API.
3. `pnpm test` / `pnpm typecheck` pass and the build/gzip does not regress.
