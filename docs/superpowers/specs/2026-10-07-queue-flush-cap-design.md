# Cap the flush at a maximum number of tasks

Date: 2026-10-07

## Motivation

`flush()` drains `while (head < queue.length)`. A command that re-triggers a bind
other than itself (directly or through a different signal) keeps appending to the
queue, so a divergent update loops forever and hangs the microtask. The per-bind
`try/catch` only catches a throwing command, not an unbounded sequence. There is no
ceiling on the number of tasks one flush may run.

## Design

### Limit

`src/core/sig.bind.ts` gains a module constant:

```ts
// Upper bound on the tasks one flush may run, so a divergent update loop cannot
// hang the microtask. Above the 150k-bind stress test, with wide headroom.
const MAX_FLUSH = 1_000_000;
```

### `flush`

Count the tasks dequeued in this pass; when the count exceeds `MAX_FLUSH`, stop.
The `finally` owns the cleanup for whatever was not run:

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

### Why the `finally` handles it

Normal completion leaves `head === queue.length`, so the `if` branch is not taken
and the queue is simply cleared — behavior is unchanged. The cap `break` leaves
`head < queue.length`; the `finally` resets `queued`/`group.queued` on the unrun
binds (so they are not permanently stuck), logs once, and clears the queue without
`kick()`, so the loop stops rather than deferring to the next microtask.

This removes the previous `queue = queue.slice(head); head = 0; kick();` overflow
path. That path was effectively dead (normal exit always drains fully, so `head ===
queue.length`), and the cap break now makes the `if` branch reachable and
meaningful.

### Behavior when the cap is hit

- The writes already applied by the tasks that ran stay applied.
- Tasks still queued are dropped (their binds are released so future writes can
  re-enqueue them).
- A single `console.error('[Queue] flush exceeded 1000000 tasks')` is logged.
- Nothing is thrown, so no error escapes the microtask.

## What does not change

Per-bind error isolation, coalescing, the group flag, ordering, `enqueue`, `kick`,
`notify`/`forceUpdate`, and any flush below the cap. No public API or error code.

## Testing

Add to `src/test/sig.bind.test.ts`:

- A divergent loop terminates at the cap: two binds on one signal, each writing
  that signal from its command, ping-pong and grow the queue; after `flush()`,
  `console.error` was called with a message containing `flush exceeded`, and the
  bind ran exactly `MAX_FLUSH` times.
- The existing `150_000`-bind test still passes (the cap is above it), and every
  other queue test is unchanged.

## Acceptance criteria

1. A flush runs at most `MAX_FLUSH` tasks, then stops, releases the unrun binds,
   logs once, and does not re-kick.
2. Flushes below the cap behave exactly as before.
3. `pnpm test` / `pnpm typecheck` pass; no public API change.
