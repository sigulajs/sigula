# Queue Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the private `Queue` singleton class with module-scope state and `const` functions so the minifier can rename them.

**Architecture:** `src/core/sig.bind.ts` drops `class Queue` and `const QUEUE`; the queue becomes module-level `let queue/head/running/scheduled` plus `const enqueue/kick/flush` arrows. `Sig.notify` calls `enqueue(this._binds)`. Logic is copied verbatim; no other file or public API changes.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, tsdown (minify).

Spec: `docs/superpowers/specs/2026-10-05-queue-module-refactor-design.md`

---

## Files

- Modify: `src/core/sig.bind.ts`

---

### Task 1: Replace the `Queue` class with module state and functions

**Files:**
- Modify: `src/core/sig.bind.ts:33-91` (the `class Queue` block and `const QUEUE = new Queue();`) and `src/core/sig.bind.ts:123` (the `QUEUE.addAll` call).

- [ ] **Step 1: Capture the current gzip size**

Run: `pnpm build`
Note the `dist/sigula.js` gzip size from the build output (for the before/after comparison in Step 5). You can also record it directly with `gzip -c dist/sigula.js | wc -c`.

- [ ] **Step 2: Replace the class with module state and functions**

In `src/core/sig.bind.ts`, replace the entire `class Queue { ... }` declaration (currently lines 33-89) **and** the following line:

```ts
const QUEUE = new Queue();
```

with:

```ts
// Module singleton, kept as plain state and functions rather than a class
// instance so the minifier can rename the state and helpers.
let queue: AnyBind[] = [];
let head = 0;
let running = false;
let scheduled = false;

const enqueue = (binds: readonly AnyBind[]): void => {
  for (const bind of binds) {
    if (bind.queued) continue;
    bind.queued = true;
    queue.push(bind);
  }
  if (queue.length > head) kick();
};

const kick = (): void => {
  if (running || scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    running = true;
    scheduled = false;
    flush();
  });
};

const flush = (): void => {
  running = true;
  try {
    while (head < queue.length) {
      const bind = queue[head++] as AnyBind;
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
      // almost impossible in js/ts
      queue = queue.slice(head);
      head = 0;
      kick();
    } else {
      queue.length = 0;
      head = 0;
    }
  }
};
```

Keep the `// biome-ignore lint/suspicious/noExplicitAny: any bind` line and `AnyBind` type above this block as they are.

- [ ] **Step 3: Update the call site**

In `Sig.notify`, replace:

```ts
  notify() {
    QUEUE.addAll(this._binds);
  }
```

with:

```ts
  notify() {
    enqueue(this._binds);
  }
```

Do not change `forceUpdate`, `update`, `trans`, or any other member.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. The queue-coalescing suite (coalescing, re-arm, mid-flush additions, removed binds, error isolation, >150k binds) must be green.

- [ ] **Step 5: Rebuild and compare the gzip size**

Run: `pnpm build`
Compare the `dist/sigula.js` gzip size to the value from Step 1. Expected: equal or smaller (tens of bytes). It must not grow.

- [ ] **Step 6: Commit**

```bash
git add src/core/sig.bind.ts
git commit -m "refactor: make the update queue module state and functions"
```

---

### Task 2: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Confirm no public surface changed**

Run: `pnpm build && rg -n "Queue" dist/sigula.d.ts || echo "no Queue in d.ts"`
Expected: no `Queue` appears in the declaration file, and `enqueue`/`kick`/`flush`/`queue` are not exported.

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `Queue` and `QUEUE` are gone; the queue is module-scope `let` state with
  `const` `enqueue`/`kick`/`flush`.
- `Sig.notify` calls `enqueue(this._binds)`; runtime behaviour unchanged.
- The full test suite and typecheck pass.
- The build succeeds and the gzipped bundle did not grow.
