# Flush Task Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound `flush()` to a maximum number of tasks so a divergent update loop cannot hang the microtask.

**Architecture:** A module constant `MAX_FLUSH = 1_000_000`; `flush` counts dequeued tasks and `break`s when the count is exceeded. The `finally` releases the unrun queued binds (resetting `queued`/`group.queued`), logs once, and clears the queue without re-kicking.

**Tech Stack:** TypeScript (strict), vitest + happy-dom.

Spec: `docs/superpowers/specs/2026-10-07-queue-flush-cap-design.md`

---

## Files

- Modify: `src/core/sig.bind.ts`
- Modify: `src/test/sig.bind.test.ts`

---

### Task 1: Add the cap and its test

**Files:**
- Modify: `src/core/sig.bind.ts`
- Test: `src/test/sig.bind.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/test/sig.bind.test.ts`:

```ts
describe('queue flush cap', () => {
  it('stops a divergent flush at the task cap', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = sig(0);
    let runs = 0;
    const bump = () => {
      runs++;
      s.forceUpdate(runs);
    };
    // Two binds on one signal, each writing that signal: every task re-queues
    // the other, so the queue grows without bound.
    createBind(s, {}, bump);
    createBind(s, {}, bump);

    s.forceUpdate(1);
    await flush();

    expect(runs).toBe(1_000_000);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('flush exceeded'),
    );
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/sig.bind.test.ts -t "flush cap"`
Expected: FAIL — it hangs/times out (no cap), or the console-error assertion fails.

- [ ] **Step 3: Add the `MAX_FLUSH` constant**

In `src/core/sig.bind.ts`, after the module queue state:

```ts
let queue: AnyBind[] = [];
let head = 0;
let running = false;
let scheduled = false;
```

add:

```ts
// Upper bound on the tasks one flush may run, so a divergent update loop cannot
// hang the microtask. Above the 150k-bind stress test, with wide headroom.
const MAX_FLUSH = 1_000_000;
```

- [ ] **Step 4: Replace `flush`**

Replace the whole `const flush = (): void => { ... };` declaration with:

```ts
const flush = (): void => {
  running = true;
  let tasks = 0;
  try {
    while (head < queue.length) {
      if (++tasks > MAX_FLUSH) break;
      const bind = queue[head++] as AnyBind;
      const group = bind.group;
      if (group) group.queued = false;
      try {
        const {removed, sig, context, cmd} = bind;
        if (!removed) cmd(sig.get(), context);
      } catch (err) {
        console.error('[Queue] task failed:', err, bind);
      } finally {
        // re-arm after running: cmd reads sig.get() at call time, so a bind
        // that runs after a write already sees the newest value and must
        // not re-run, while one that ran before it has to be queued again
        bind.queued = false;
      }
    }
  } finally {
    running = false;
    if (head < queue.length) {
      // Cap hit: release the tasks we did not run so a later write can
      // re-enqueue them, then report once.
      for (let i = head; i < queue.length; i++) {
        const b = queue[i] as AnyBind;
        b.queued = false;
        if (b.group) b.group.queued = false;
      }
      console.error(`[Queue] flush exceeded ${MAX_FLUSH} tasks`);
    }
    queue.length = 0;
    head = 0;
  }
};
```

(`kick`, `enqueue`, and everything else are unchanged.)

- [ ] **Step 5: Run the focused test and the suite**

Run: `pnpm vitest run src/test/sig.bind.test.ts`
Expected: PASS, including the `150_000`-bind stress test (below the cap) and the new cap test.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm exec biome check src/core/sig.bind.ts src/test/sig.bind.test.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/sig.bind.ts src/test/sig.bind.test.ts
git commit -m "fix: cap the flush at a maximum number of tasks"
```

---

### Task 2: Full verification

- [ ] **Step 1: Run the whole suite, typecheck, and build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 2: Confirm no public/docs change**

Run: `pnpm docs:api && git status --short`
Expected: no change to `Reference.md` (no public API change).

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- A flush runs at most `MAX_FLUSH` tasks, then stops, releases the unrun binds,
  logs once, and does not re-kick.
- Flushes below the cap behave exactly as before.
- `pnpm test` / `pnpm typecheck` pass; no public API change.
