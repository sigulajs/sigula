# `Sig.notify`: enqueue bindings without a value change

Date: 2026-10-05

## Motivation

A `Sig`'s bindings are only enqueued through `forceUpdate(v)`, which first sets
`_val` to `v`. When a value is mutated in place, the reference does not change,
so the documented workaround is to re-pass the same reference:

```ts
const items = sig<Todo[]>([]);
items.get().push(todo);
items.forceUpdate(items.get()); // same reference, re-notifies
```

That is awkward and forces a redundant argument. A signal should be able to tell
its dependents "re-read me" without a setter:

```ts
items.get().push(todo);
items.notify();
```

## API

On `Sig<T>` (and therefore inherited by `DerivedSig<T>`):

```ts
notify(): void;
```

## Design

### Implementation

`notify` is the single primitive that enqueues a signal's bindings:

```ts
notify() {
  QUEUE.addAll(this._binds);
}

forceUpdate(v: T) {
  this._val = v;
  this.notify();
}
```

`QUEUE` is the existing module-private microtask queue in `src/core/sig.bind.ts`.
`forceUpdate` is refactored to call `notify`, removing the duplicated
`QUEUE.addAll(this._binds)` call; `update` and `trans` are unchanged.

### Semantics

- `notify()` does not read or write `_val` and performs no equality check. It only
  schedules the signal's current bindings.
- Bindings are batched and coalesced by the existing queue: calling `notify()`
  several times before the microtask flush runs each dependent once, against the
  signal's current value.
- `notify()` with no bindings is a no-op (`addAll` returns early).
- Use it when a value is mutated in place and its reference is unchanged. Use
  `forceUpdate(v)` when you both set a new value and need dependents to run even
  if that value is structurally equal. Use `update(v)` for the normal
  equality-guarded set.
- `DerivedSig` inherits `notify`; notifying a derived signal schedules its
  consumers against its current value. Derived signals normally recompute from
  their sources, so this is an escape hatch rather than the usual path.

### What does not change

`update`, `trans`, `get`, `forceUpdate`'s external behavior, `addBind`,
`removeBind`, `cleanup`, and the queue implementation. No new error codes.

## Testing

Add cases to `src/test/sig.bind.test.ts`:

- `notify()` runs a dependent binding on the microtask flush while `get()` is
  unchanged;
- multiple `notify()` calls before the flush run each dependent once;
- `notify()` on a plain `Sig` causes a `compute` dependent to recompute;
- `notify()` with no bindings does not throw and is a no-op;
- `forceUpdate` still sets the value and notifies (regression check).

## Docs

Add a `notify` row to the `Sig<T>` members table in the README, and a sentence in
the Reactivity model's `update` vs `forceUpdate` bullet (or a new bullet)
describing `notify` for in-place mutation.

## Acceptance criteria

1. `sig.notify()` enqueues dependents without changing `get()`.
2. Multiple `notify()` calls coalesce to one run per binding.
3. `forceUpdate` continues to set the value and notify.
4. `notify()` is documented; `pnpm test` and `pnpm typecheck` pass.
