# `ref`: capture the current element in a signal

Date: 2026-10-07

## Motivation

Binding commands receive the element only inside their command (`act` exposes it
as `fn(node, val)`), so there is no first-class way to get a handle to an element
after it mounts. React-style refs give that handle:

```ts
const input = sig<HTMLInputElement | null>(null);
html`<input ${patch(ref(input))} />`;
input.get(); // the element, or null before mount / after teardown
```

A signal is the natural home in sigula: consumers can react to the element (for
example `view(inputSig, …)`), and there is no new mutable-box type to learn.

## API

```ts
export const ref = <T extends Element>(target: Sig<T | null>): ToPatchItem<null>;
```

- Must be interpolated in an attribute position, like the other commands.
- On mount, sets `target` to the patched element.
- On dispose (when the patch's `cleanBinds` runs), sets `target` back to `null`.
- Carries no reactive source of its own, so its command runs once on mount.

```ts
const input = sig<HTMLInputElement | null>(null);
html`<input ${patch(ref(input))} />`;
input.get(); // HTMLInputElement | null
```

## Design

### Command

In `src/patch.ts`:

```ts
const refCmd = (_val: null, ctx: PatchContext) => {
  const target = ctx.extra?.[0] as Sig<Element | null> | undefined;
  if (!target) return;
  target.update(ctx.node as Element);
  ctx.cleanup = () => target.update(null);
};

/**
 * Captures the patched element into `target` on mount and resets it to `null`
 * on dispose.
 * ...
 * @group DOM bindings
 */
export const ref = <T extends Element>(
  target: Sig<T | null>,
): ToPatchItem<null> => toPatchItem(null, [target], refCmd);
```

`ctx.node` is an `Element` (patches apply in attribute position), so the cast to
`Element`/`T` is sound.

### Teardown hook

`commitPatch` currently only tears down binds it created for `Sig` sources. `ref`
uses a non-`Sig` (null) source, so it needs a per-item cleanup:

- `PatchContext` (in `src/core/patch.core.ts`) gains an internal optional
  `cleanup?: () => void` (a plain `//` comment, kept out of the reference).
- `commitPatch` (in `src/html.ts`) collects `item.context.cleanup` after running
  each command and runs the collected cleanups in `patch.cleanBinds`, after the
  `removeBind`s:

```ts
const binds: Bind<unknown, PatchContext>[] = [];
const cleanups: (() => void)[] = [];
patch.toPatchItems.forEach((toPatchItem) => {
  const item = toPatchItem(node as Element);
  if (item.source instanceof Sig) {
    item.cmd(item.source.get(), item.context);
    binds.push(createBind(item.source, item.context, item.cmd));
  } else {
    item.cmd(item.source, item.context);
  }
  if (item.context.cleanup) cleanups.push(item.context.cleanup);
});
patch.cleanBinds = () => {
  binds.forEach(removeBind);
  cleanups.forEach((cleanup) => cleanup());
};
```

No `Cmd` signature change and no new error code. The `cleanup` field is optional,
so every existing command is unaffected.

### What does not change

`patch`, `act`, `on`, the other commands, `PatchProps` desugaring, the bind queue,
and `cleanBinds` for bind-backed commands. `ref` is additive; it is not part of the
`PatchProps` object form.

## Testing

Add to `src/test/patch.test.ts`:

- `ref` sets the target signal to the mounted element, and `null` after the
  `render` disposer runs;
- a typed ref (`Sig<HTMLInputElement | null>`) receives the element;
- a `view(refSig, …)` reacts to both the mount value and the reset to `null`.

## Docs

- Add a `ref` command to the README's patch-commands row in the API Cheat Sheet.
- Add `ref` to the generator `ORDER` (next to the other commands) and regenerate
  `Reference.md`; the `ref` entry carries a `@group DOM bindings` TSDoc block with
  an example.

## Acceptance criteria

1. `patch(ref(sig))` sets `sig` to the element on mount and `null` on dispose.
2. Works with a typed element signal and composes with `view`/`compute`.
3. No change to existing commands, `PatchProps`, or the queue; `ref` is not in
   the props form.
4. `pnpm test` / `pnpm typecheck` pass and `Reference.md` gains a `ref` entry.
