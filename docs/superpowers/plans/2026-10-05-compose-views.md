# `composeViews` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shared `frag`/`list` body into an internal `composeViews`, leaving both public helpers thin.

**Architecture:** New internal `src/core/compose.ts` (not re-exported from `core/index.ts`) exports `composeViews(views, empty?)`, which builds the fragment, derives the lazy boundary, and cleans children. `frag` and `list` import it directly and only supply their view list and empty placeholder.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-compose-views-design.md`

---

## Files

- Create: `src/core/compose.ts`
- Modify: `src/frag.ts`
- Modify: `src/list.ts`

---

### Task 1: Extract and rewire

**Files:**
- Create: `src/core/compose.ts`
- Modify: `src/frag.ts`
- Modify: `src/list.ts`

- [ ] **Step 1: Create `src/core/compose.ts`**

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

Do **not** add `export * from './compose';` to `src/core/index.ts` — this keeps `composeViews` internal.

- [ ] **Step 2: Rewrite `src/frag.ts`**

Keep the existing TSDoc block above the export unchanged. Replace the import and the `frag` implementation with:

```ts
import {type AnyView, type View} from './core';
import {composeViews} from './core/compose';

export const frag = (...views: AnyView[]): View =>
  composeViews(
    views,
    views.length === 0 ? document.createTextNode('') : undefined,
  );
```

- [ ] **Step 3: Rewrite `src/list.ts`**

Keep the existing TSDoc block above the export unchanged. Replace the import and the `list` implementation with:

```ts
import {type AnyView, type View} from './core';
import {composeViews} from './core/compose';

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

- [ ] **Step 4: Run the focused suites and typecheck**

Run: `pnpm vitest run src/test/frag.test.ts src/test/list.test.ts && pnpm typecheck`
Expected: PASS (all existing frag/list cases, unchanged behavior).

- [ ] **Step 5: Run the full suite and build**

Run: `pnpm test && pnpm build`
Expected: PASS. Note the `dist/sigula.js` gzip size for the delta.

- [ ] **Step 6: Confirm `composeViews` stays internal**

Run: `rg -n "composeViews" dist/sigula.d.ts || echo "not exported"`
Expected: not exported (the helper is absent from the declaration file).

- [ ] **Step 7: Commit**

```bash
git add src/core/compose.ts src/frag.ts src/list.ts
git commit -m "refactor: share frag/list body via internal composeViews"
```

---

### Task 2: Full verification

- [ ] **Step 1: Confirm behavior parity**

Run: `pnpm test`
Expected: PASS (184+ tests, including the frag/list edge-swap and empty-placeholder cases).

- [ ] **Step 2: Confirm no public-surface or docs change**

Run: `pnpm docs:api && git status --short`
Expected: `Reference.md` unchanged (no new export, no TSDoc change).

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `frag` and `list` are implemented on top of a single internal `composeViews`.
- Behavior, signatures, and `Reference.md` are unchanged; `composeViews` is not
  exported.
- `pnpm test` / `pnpm typecheck` pass and the build/gzip does not regress.
