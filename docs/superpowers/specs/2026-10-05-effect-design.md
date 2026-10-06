# `effect`: run a side effect over signals

Date: 2026-10-05

## Motivation

`compute` derives a value from one signal or a record of signals. Running an
arbitrary side effect from signals currently means wiring `createBind` by hand:

```ts
const bind = createBind(sig, {}, (v) => console.log(v));
// ...
removeBind(bind);
```

Two signal sources require repeating this per signal and manually sharing a
record. `effect` packages that into one call mirroring `compute`:

```ts
const dispose = effect(sigOrSigRecord, (v): void => {
  // side effect
});
dispose();
```

## API

```ts
function effect<S>(source: Sig<S>, fn: (v: S) => void): () => void;
function effect<S extends SigRecord>(
  source: S,
  fn: (v: ValRecord<S>) => void,
): () => void;
```

- `fn` returns `void`; its result is ignored.
- The returned function detaches the effect; calling it more than once is safe.

## Design

### Implementation

`effect` lives in `src/core/compute.ts` alongside `compute`, which already
defines `SigRecord` and `ValRecord`.

```ts
const _effect = <S>(source: Sig<S>, fn: (v: S) => void): (() => void) => {
  fn(source.get());
  const bind = createBind(source, {}, (v: S) => fn(v));
  return () => removeBind(bind);
};
```

Dispatch mirrors `compute`: if the source is a `Sig`, bind to it directly.
Otherwise derive an identity value from the record and bind to that derived
signal:

```ts
export function effect(source: any, fn: (v: any) => void): () => void {
  return source instanceof Sig
    ? _effect(source, fn)
    : _effect(compute(source, (v) => v), fn);
}
```

### Immediate run

`fn` is called synchronously with the current value before the bind is created.
Running it before `createBind` means a write performed by `fn` cannot re-trigger
the effect. This matches `compute`'s eager first evaluation.

### Coalescing

- Single signal: exactly one bind, so the queue's per-bind coalescing already
  guarantees `fn` runs once per microtask flush, with the final value.
- Record: a single `compute(record, (v) => v)` derived is created and `fn` binds
  to that one signal. When several sources change in the same flush the derived
  updates once (its `update` dedupes equal records), so the effect's one bind
  runs once with the record of current values. This is why the record case uses
  one derived rather than one bind per source.

### Disposal

The returned disposer calls `removeBind` on the effect's bind. For a record, that
drops the derived signal's last consumer, so `DerivedSig.cleanup` removes the
derived's own source binds. No other teardown is needed; the effect is a plain
signal consumer and is not tied to any view.

### What does not change

No change to `compute`, `createBind`, `removeBind`, `DerivedSig`, or any existing
behavior. `effect` is additive. No new error codes.

## Testing

Create `src/test/effect.test.ts`:

- runs `fn` immediately with the current value;
- runs `fn` again after a source update, once per flush when the source is
  written several times;
- with a record, binds all sources and calls `fn` once per flush with the record
  of final values when multiple sources change together;
- the disposer stops further calls;
- calling the disposer twice does not throw;
- a record effect's disposer removes the internal derived's source binds (for
  example, `sig.getBinds().length` returns to `0`).

## Docs

- Add an `effect(source, fn)` row to the README API Cheat Sheet (kind: side
  effect; returns a disposer).
- Update the README bindings section sentence that says there is "no separate
  `effect()`/`watch()` API" — `effect` now exists as sugar over `createBind`.
- Add a `#group Reactivity` TSDoc block on `effect` and its overloads, then
  regenerate `Reference.md` (add `effect` to the generator `ORDER` near
  `compute`).

## Acceptance criteria

1. `effect(sig, fn)` and `effect(record, fn)` call `fn` immediately and on change.
2. Multiple changes in one flush produce a single `fn` call with final values,
   for both the single-signal and record forms.
3. The returned disposer detaches the effect and is idempotent.
4. `effect` is documented, appears in `Reference.md`, and `pnpm test` /
   `pnpm typecheck` pass.
