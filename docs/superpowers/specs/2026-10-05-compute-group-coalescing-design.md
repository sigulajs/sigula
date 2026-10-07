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

The group lives on the **shared context**, not on the `Bind`:

```ts
interface ComputeRecordContext<S extends SigRecord, T> extends CmdContext {
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
  entries: ComputeEntry[];
  group: {queued: boolean};
}
```

`_computeRecord` creates one `group: {queued: false}` in the context literal, so
every source bind of that record shares it. `ComputeRecordContext` is internal
(not exported), so there is no public type change.

The plain flag is safe across re-arm because `DerivedSig` reuses its existing
from-binds: `cleanup` marks them `removed`, and re-arm resets `removed` and
re-adds the same bind objects. A queued representative therefore stays live, so
the flag cannot go stale and suppress a fresh bind: the formerly-queued bind is
still the one that runs on flush. The synchronous recompute on re-arm is kept,
and only skipped when the first from-bind is already queued (the pending run will
see the current values).

Placing the group on the context — rather than adding `Bind.group` — means
`DerivedSig`'s re-arm needs no change: it reuses binds that carry `f.context`,
which is the same shared object, so the group survives a hide/re-show.

### Queue

In `src/core/sig.bind.ts`, a small helper reads the group from a bind's context,
and `enqueue`/`flush` consult it:

```ts
const groupOf = (
  ctx: object,
): {queued: boolean} | undefined =>
  (ctx as {group?: {queued: boolean}}).group;
```

`enqueue`: a bind whose group is already scheduled is skipped, so only the first
bind of a group is pushed in a given flush:

```ts
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
```

`flush`: the group is cleared **before** the command runs, and `bind.queued` is
cleared after it, as today:

```ts
while (head < queue.length) {
  const bind = queue[head++] as AnyBind;
  const group = groupOf(bind.context);
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

`Bind`, `createBind`, `removeBind`, `DerivedSig` (including re-arm), the
`ComputeContext` for single-source `compute`, `effect`, and the error/removed
handling. No exported symbol changes; no error codes.

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
4. No public API changes; `pnpm test` / `pnpm typecheck` pass.
