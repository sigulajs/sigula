# `Sig.notify` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Sig.notify()`, which enqueues a signal's bindings without changing its value, and route `forceUpdate` through it.

**Architecture:** `notify()` becomes the single primitive that calls `QUEUE.addAll(this._binds)`. `forceUpdate(v)` sets `_val` then calls `this.notify()`. `update`/`trans` and the queue are unchanged. `DerivedSig` inherits `notify`.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-sig-notify-design.md`

---

## Files

- Modify: `src/core/sig.bind.ts` — add `notify`, refactor `forceUpdate`.
- Test: `src/test/sig.bind.test.ts`.
- Modify: `README.md` — `Sig` members table row and reactivity-model bullet.

---

### Task 1: Add `Sig.notify` and its tests

**Files:**
- Modify: `src/core/sig.bind.ts:94-97`
- Test: `src/test/sig.bind.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `src/test/sig.bind.test.ts` (after the final `describe('DerivedSig re-arm', ...)` block; the file already imports `compute`, `createBind`, `sig`, and defines `flush`):

```ts
describe('Sig.notify', () => {
  it('runs dependents without changing the value', async () => {
    const s = sig(1);
    const seen: number[] = [];
    createBind(s, {}, (v: number) => {
      seen.push(v);
    });

    s.notify();
    await flush();

    expect(seen).toEqual([1]);
    expect(s.get()).toBe(1);
  });

  it('coalesces multiple notifies into one run per bind', async () => {
    const s = sig('x');
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    s.notify();
    s.notify();
    s.notify();
    await flush();

    expect(runs).toBe(1);
  });

  it('recomputes a derived signal', async () => {
    const items = sig<number[]>([]);
    const count = compute(items, (v) => v.length);
    expect(count.get()).toBe(0);

    items.get().push(1);
    items.notify();
    await flush();

    expect(count.get()).toBe(1);
  });

  it('is a no-op with no bindings', () => {
    const s = sig(0);
    expect(() => s.notify()).not.toThrow();
    expect(s.getBinds().length).toBe(0);
  });

  it('forceUpdate still sets the value and notifies', async () => {
    const s = sig(1);
    const seen: number[] = [];
    createBind(s, {}, (v: number) => {
      seen.push(v);
    });

    s.forceUpdate(2);
    await flush();

    expect(s.get()).toBe(2);
    expect(seen).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/test/sig.bind.test.ts -t "Sig.notify"`
Expected: FAIL — `s.notify` is not a function (typecheck also errors).

- [ ] **Step 3: Add `notify` and refactor `forceUpdate` in `src/core/sig.bind.ts`**

Replace:

```ts
  forceUpdate(v: T) {
    this._val = v;
    QUEUE.addAll(this._binds);
  }
```

with:

```ts
  notify() {
    QUEUE.addAll(this._binds);
  }

  forceUpdate(v: T) {
    this._val = v;
    this.notify();
  }
```

Do not change `update`, `trans`, `get`, `addBind`, `removeBind`, `getBinds`, `cleanup`, or the `Queue` class.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm vitest run src/test/sig.bind.test.ts && pnpm typecheck`
Expected: PASS, including the new `Sig.notify` block.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/sig.bind.ts src/test/sig.bind.test.ts
git commit -m "feat: add Sig.notify to enqueue bindings without a value change"
```

---

### Task 2: Document `notify` in the README

**Files:**
- Modify: `README.md` — the `Sig<T>` members table and the Reactivity model.

- [ ] **Step 1: Add a `notify` row to the `Sig<T>` members table**

After this row (currently line 273):

```markdown
| `forceUpdate` | `(v: T): void` | Sets the value and always notifies dependents, even when deeply equal. |
```

insert:

```markdown
| `notify` | `(): void` | Enqueues dependents without changing the value; use after mutating a held object or array in place. |
```

- [ ] **Step 2: Add a reactivity-model bullet**

After this bullet (currently line 815):

```markdown
- **`update` vs `forceUpdate`.** `update` skips work when the new value is deeply equal to the current one; `forceUpdate` always notifies. Use `forceUpdate` when a value is structurally equal but you still need a re-render (for example, mutating an object in place).
```

insert:

```markdown
- **`notify` for in-place mutation.** `sig.notify()` re-runs dependents against the current value without setting a new one. Use it after mutating a held object or array in place; `update`/`forceUpdate` set a value.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Sig.notify"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Build to validate declaration output**

Run: `pnpm build`
Expected: build succeeds and `dist/sigula.d.ts` shows `notify(): void` on `Sig`.

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `sig.notify()` enqueues dependents without changing `get()`.
- Multiple `notify()` calls coalesce to one run per binding.
- `forceUpdate` continues to set the value and notify.
- `notify` is documented; `pnpm test` and `pnpm typecheck` pass.
