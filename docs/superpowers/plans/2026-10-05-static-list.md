# Static List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static `list(items, viewFn)` helper that renders a fixed array as sibling views in order.

**Architecture:** `list` builds a `DocumentFragment` by mapping `items` through `viewFn(item, index)` and appending each returned `.node`, mirroring `repeat`'s `_init` without keys or binds. It precomputes `toBoundary(frag)` before insertion (inserting a fragment empties it) and tears down by cleaning every child view. A new `src/list.ts` keeps it single-purpose; `repeat` is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-static-list-design.md`

---

## Files

- Create: `src/list.ts` — the `list` implementation.
- Modify: `src/index.ts` — export `./list`.
- Create: `src/test/list.test.ts` — tests.
- Modify: `README.md` — document `list` in the Control flow section.

---

### Task 1: Implement `list` and export it

**Files:**
- Create: `src/list.ts`
- Modify: `src/index.ts`
- Test: `src/test/list.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/list.test.ts`:

```ts
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {html, list, render, sig, text, view} from '..';

describe('list', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders items in order and passes the index', () => {
    render(
      list(['a', 'b', 'c'], (item, index) => text(`${item}${index}`)),
      document.body,
    );
    expect(document.body.innerHTML).toBe('a0b1c2');
  });

  it('updates reactive content inside an item', async () => {
    const count = sig(0);
    render(
      list(['a', 'b'], (item) => html`<span>${item}${text(count)}</span>`),
      document.body,
    );
    expect(document.body.innerHTML).toBe('<span>a0</span><span>b0</span>');

    count.update(1);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<span>a1</span><span>b1</span>');
  });

  it('renders an empty-list comment without calling viewFn', () => {
    const fn = vi.fn(() => text('x'));
    render(list([], fn), document.body);
    expect(document.body.innerHTML).toBe('<!--empty-list-->');
    expect(fn).not.toHaveBeenCalled();
  });

  it('cleans nested binds on dispose', () => {
    const s = sig('x');
    const dispose = render(
      list([1, 2], () => text(s)),
      document.body,
    );
    expect(s.getBinds().length).toBe(2);

    dispose();
    expect(s.getBinds().length).toBe(0);
  });

  it('keeps following siblings when used in html', () => {
    render(
      html`<main>${list([1, 2], (n) => text(String(n)))}<footer>KEPT</footer></main>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe(
      '<main>12<footer>KEPT</footer></main>',
    );
  });

  it('accepts a readonly array', () => {
    const items: readonly number[] = [1, 2];
    render(
      list(items, (n) => text(String(n))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('12');
  });

  it('supports a reactive view inside an item', async () => {
    const mode = sig('a');
    render(
      list([1, 2], (n) => view(mode, (v) => text(`${n}:${v}`))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('1:a2:a');

    mode.update('b');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('1:b2:b');
  });

  it('disposes nodes when an edge item swaps its node', async () => {
    const mode = sig(true);
    const dispose = render(
      list([1, 2], (n) =>
        n === 1
          ? view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`))
          : text('2'),
      ),
      document.body,
    );
    expect(document.body.innerHTML).toBe('<i>1</i>2');

    mode.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>1</b>2');

    dispose();
    expect(document.body.innerHTML).toBe('');
  });

  it('disposes correctly when a list edge item swaps inside html', async () => {
    const mode = sig(true);
    const dispose = render(
      html`${list([1], () =>
        view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`)),
      )}<footer>KEPT</footer>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<i>1</i><footer>KEPT</footer>');

    mode.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>1</b><footer>KEPT</footer>');

    dispose();
    expect(document.body.innerHTML).toBe('');
  });

  it('nests lists', () => {
    render(
      list([1, 2], (n) => list([n, n], (m) => text(String(m)))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('1122');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/test/list.test.ts`
Expected: FAIL — `list` is not exported from `..` (import/type error).

- [ ] **Step 3: Create `src/list.ts`**

```ts
import {type AnyView, at, type View} from './core';

export const list = <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
): View => {
  if (items.length === 0) {
    const empty = document.createComment('empty-list');
    return {
      type: 'view',
      node: empty,
      boundary: () => ({start: empty, end: empty}),
      cleanBinds: () => {},
    };
  }

  const frag = document.createDocumentFragment();
  const views: AnyView[] = [];

  items.forEach((item, index) => {
    const view = viewFn(item, index);
    views.push(view);
    frag.appendChild(view.node);
  });

  return {
    type: 'view',
    node: frag,
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

- [ ] **Step 4: Export it from `src/index.ts`**

Insert `export * from './list';` between the `./html` and `./patch` exports so the list stays alphabetical:

```ts
export * from './core';
export * from './html';
export * from './list';
export * from './patch';
export * from './render';
export * from './repeat';
export * from './text';
export * from './view';
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run src/test/list.test.ts && pnpm typecheck`
Expected: PASS. All 10 `list` cases pass and there are no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/list.ts src/index.ts src/test/list.test.ts
git commit -m "feat: add static list helper"
```

---

### Task 2: Document `list` in the README

**Files:**
- Modify: `README.md` — Control flow section, after the `repeat` subsection (currently the `repeat` prose ends around line 662, before `### Rendering`).

- [ ] **Step 1: Insert the `list` subsection before `### Rendering`**

````markdown
#### `list`

```ts
const list: <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
) => View;
```

Renders a fixed array in order. `viewFn` is called once per item with the item and its 0-based index, and each returned `AnyView` is appended in sequence. There is no keying or reconciliation and no reactive source — any reactivity comes from the views `viewFn` returns. Use [`repeat`](#repeat) for reactive, keyed lists.

```ts
html`<ul>${list(items, (item, i) => html`<li>${i}: ${text(item)}</li>`)}</ul>`;
```

An empty array renders `<!--empty-list-->`.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document static list helper"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. The new `list` suite is included; no other suite changes.

- [ ] **Step 2: Build to validate declaration output**

Run: `pnpm build`
Expected: build succeeds and `dist/sigula.d.ts` exports `list`. If tsdown rewrites `package.json`, confirm `git diff` shows only expected changes and revert unrelated churn.

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `list(items, viewFn)` renders one view per item in order with the correct index.
- `list([])` renders `<!--empty-list-->` without calling `viewFn`.
- Nested reactive views update and detach when the list is disposed.
- `list` works inside `html` and as a `render` root without disturbing surrounding nodes.
- `pnpm test` and `pnpm typecheck` pass.
