# Coalescing `compute(record, fn)` with a shared group

Date: 2026-10-05

## Motivation

`compute(record, fn)` gives each source signal its own bind, all sharing one
`ComputeRecordContext` and one command (`computeRecordCmd`). When several sources
change in the same microtask flush, the queue runs that command once per changed
source; `target.update` dedupes the resulting value, but `fn` still runs once per
source. A shared "already scheduled this flush" flag lets the record command run
once per flush.

`effect(record, fn)` is unaffected: it binds a single derived signal, so it
already runs once per flush.

## Design

### Storage

The group lives on the **`Bind`**, shared by the source binds of one record:

```ts
interface Bind<T, C extends CmdContext> {
  // ...
  queued?: boolean;
  group?: {queued: boolean};
}
```

`_computeRecord` creates one `group: {queued: false}` and assigns it to every
source bind it creates, so they share it. This is safe now that `DerivedSig`
reuses its existing from-binds on re-arm: `cleanup` marks them `removed`, and
re-arm resets `removed` and re-adds the same bind objects, so a bind's `group`
survives. (Before reuse, re-arm created fresh binds and a `Bind.group` would have
been lost; that is why the group was first placed on the context.)

The group flag cannot go stale and suppress a fresh bind: the formerly-queued bind
is the one that runs on flush. The synchronous recompute on re-arm is kept, and
only skipped when a bind of the group is already queued (that pending run will
see the current values).

### Queue

In `src/core/sig.bind.ts`, `enqueue`/`flush` read the group straight off the
bind. `enqueue`: a bind whose group is already scheduled is skipped, so only the
first bind of a group is pushed in a given flush:

```ts
for (const bind of binds) {
  if (bind.queued) continue;
  const group = bind.group;
  if (group) {
    if (group.queued) continue;
    group.queued = true;
  }
  bind.queued = true;
  queue.push(bind);
}
if (queue.length > head) kick();
```

`flush`: the group is cleared **before** the command runs, and `bind.queued` is
cleared after it, as today:

```ts
while (head < queue.length) {
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
```

Clearing the group before the command means a write made *during* the command to
another source of the same record still re-queues (the flag is already false),
preserving the per-bind re-arm guarantee. Clearing it after would drop such a
write. For `computeRecordCmd` specifically the command never writes to its
sources, so the two are equivalent today; clearing first is the safe choice.

### What does not change

`createBind`, `removeBind`, `DerivedSig` (including re-arm), the `ComputeContext`
for single-source `compute`, `effect`, and the error/removed handling. `Bind`
gains one optional, additive `group` member (documented in `Reference.md`); no
new exported symbols and no error codes.

## Testing

Add to `src/test/sig.bind.test.ts` (or the compute coverage):

- `compute(record, fn)` runs `fn` once per flush when several sources change
  together (e.g. `a` and `b` updated before one flush increments the call count
  once, not twice), and the derived value uses the final values.
- The same coalescing holds after the derived is hidden and re-shown through a
  `view()` (the `DerivedSig` re-arm path), proving the group survives re-arm.
- Single-source `compute(sig, fn)` is unaffected (one source, one run).

## Verification

- `pnpm test` and `pnpm typecheck` pass.
- `pnpm build` succeeds; report the gzip delta for `dist/sigula.js`.
- Existing behaviour for `compute`, `effect`, `view`/`repeat` toggling, and the
  queue suite is unchanged.

## Acceptance criteria

1. Several sources of one `compute(record, fn)` changing in a single flush run
   `fn` once, with the final values.
2. Coalescing still holds after a `DerivedSig` hide/re-show (re-arm).
3. Single-signal `compute` and all other reactive behaviour are unchanged.
4. No new exported symbols (only an optional `Bind.group` member is added);
   `pnpm test` / `pnpm typecheck` pass.
