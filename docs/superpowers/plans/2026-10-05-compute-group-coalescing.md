# Compute Record Group Coalescing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `compute(record, fn)`'s command once per flush when several sources change together, via a shared `{queued: boolean}` group stored on the record's context.

**Architecture:** The internal `ComputeRecordContext` gains `group: {queued: boolean}`, shared by all its source binds. The queue reads the group from `bind.context`: `enqueue` skips a bind whose group is already scheduled; `flush` clears the group just before running the command. Nothing public changes; `DerivedSig` re-arm is untouched because it reuses the same context object.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-compute-group-coalescing-design.md`

---

## Files

- Modify: `src/core/compute.ts` — `ComputeRecordContext` + `_computeRecord`.
- Modify: `src/core/sig.bind.ts` — queue `enqueue`/`flush`.
- Modify: `src/test/sig.bind.test.ts` — tests.

---

### Task 1: Add the group and queue support

**Files:**
- Modify: `src/core/compute.ts`
- Modify: `src/core/sig.bind.ts`
- Test: `src/test/sig.bind.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/sig.bind.test.ts`:

```ts
describe('compute record coalescing', () => {
  it('runs the record fn once per flush when several sources change', async () => {
    const a = sig(1);
    const b = sig(2);
    let calls = 0;
    const sum = compute({a, b}, (v) => {
      calls++;
      return v.a + v.b;
    });
    expect(calls).toBe(1);

    a.update(10);
    b.update(20);
    await flush();

    expect(calls).toBe(2);
    expect(sum.get()).toBe(30);
  });

  it('keeps coalescing after a hide and re-show', async () => {
    const a = sig(1);
    const b = sig(2);
    let calls = 0;
    const sum = compute({a, b}, (v) => {
      calls++;
      return v.a + v.b;
    });

    const show = sig(true);
    const dispose = render(
      html`<p>${view(show, (v) => (v ? text(sum) : text('off')))}</p>`,
      document.body,
    );

    show.update(false);
    await flush();
    show.update(true);
    await flush();

    calls = 0;
    a.update(10);
    b.update(20);
    await flush();

    expect(calls).toBe(1);
    expect(sum.get()).toBe(30);
    dispose();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/test/sig.bind.test.ts -t "compute record coalescing"`
Expected: the first test FAILS (`calls` is `3`, not `2`); the second fails for the same reason after re-show.

- [ ] **Step 3: Add the group to `ComputeRecordContext` in `src/core/compute.ts`**

Change:

```ts
interface ComputeRecordContext<S extends SigRecord, T> extends CmdContext {
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
  entries: ComputeEntry[];
}
```

to:

```ts
interface ComputeRecordContext<S extends SigRecord, T> extends CmdContext {
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
  entries: ComputeEntry[];
  group: {queued: boolean};
}
```

And in `_computeRecord`, change:

```ts
  const ctx: ComputeRecordContext<S, T> = {target, fn, entries};
```

to:

```ts
  const ctx: ComputeRecordContext<S, T> = {
    target,
    fn,
    entries,
    group: {queued: false},
  };
```

- [ ] **Step 4: Read the group in the queue (`src/core/sig.bind.ts`)**

Add a small helper next to the queue state:

```ts
const groupOf = (ctx: object): {queued: boolean} | undefined =>
  (ctx as {group?: {queued: boolean}}).group;
```

Change `enqueue` from:

```ts
const enqueue = (binds: readonly AnyBind[]): void => {
  for (const bind of binds) {
    if (bind.queued) continue;
    bind.queued = true;
    queue.push(bind);
  }
  if (queue.length > head) kick();
};
```

to:

```ts
const enqueue = (binds: readonly AnyBind[]): void => {
  for (const bind of binds) {
    if (bind.queued) continue;
    const group = groupOf(bind.context);
    if (group) {
      if (group.queued) continue;
      group.queued = true;
    }
    bind.queued = true;
    queue.push(bind);
  }
  if (queue.length > head) kick();
};
```

Change the bind iteration in `flush` from:

```ts
      const bind = queue[head++] as AnyBind;
      try {
        const {removed, sig, context, cmd} = bind;
        if (!removed) cmd(sig.get(), context);
      } catch (err) {
```

to:

```ts
      const bind = queue[head++] as AnyBind;
      const group = groupOf(bind.context);
      if (group) group.queued = false;
      try {
        const {removed, sig, context, cmd} = bind;
        if (!removed) cmd(sig.get(), context);
      } catch (err) {
```

(The group is cleared *before* the command so a write made during it re-queues; `bind.queued` is still cleared after, in the existing `finally`.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run src/test/sig.bind.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/compute.ts src/core/sig.bind.ts src/test/sig.bind.test.ts
git commit -m "perf: coalesce compute records per flush"
```

---

### Task 2: Full verification

- [ ] **Step 1: Capture the gzip delta**

Run `pnpm build` and note the `dist/sigula.js` gzip size; compare it against the build before this change (the previous commit). Report the delta (expected: a few bytes larger).

- [ ] **Step 2: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Confirm no public surface changed**

Run: `pnpm build && rg -n "group\\??:" dist/sigula.d.ts || echo "no group member in d.ts"`
Expected: no `group` member on `Bind` or other exported types (the group is internal
to a non-exported context). The `@group` TSDoc tags are not `group:` members.

- [ ] **Step 4: Confirm the spec's acceptance criteria**

- Several sources of one `compute(record, fn)` changing in a single flush run `fn`
  once, with the final values.
- Coalescing still holds after a `DerivedSig` hide/re-show.
- Single-signal `compute` and all other reactive behaviour are unchanged.
- No public API changes; `pnpm test` / `pnpm typecheck` pass.
