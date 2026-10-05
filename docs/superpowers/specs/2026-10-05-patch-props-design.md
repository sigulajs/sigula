# PatchProps: object form for `patch`

Date: 2026-10-05

## Motivation

Today every binding is declared command by command:

```ts
html`<input ${patch(val(name), attr(placeholder, 'name'))} />`;
```

For the common "set several attributes and properties on this element" case this is
verbose, and it duplicates information the template author already thinks in
(attribute names). A props object reads like the element it annotates and lets
reactive values sit directly where a static attribute value would:

```ts
html`<input ${patch({val: name, placeholder: 'name'})} />`;
```

The goal is to add this object form to `patch` without changing the existing
binding model, while still allowing props to be combined with the command form
(`patch({...}, act(...))`).

## API

```ts
type Reactive<T> = T | Sig<T>;

export interface PatchProps {
  id?: Reactive<string>;
  val?: Reactive<string>;
  class?: Record<string, Reactive<boolean>>; // reactive class map
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  styleProp?: Record<string, Reactive<string>>;
  on?: {[K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void};
  [attr: string]: unknown;
}

export function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
export function patch(...toPatchItems: ToAnyPatchItem[]): Patch;
```

`patch` changes from `export const patch = (...items) => ({...})` to a function
declaration with the two overloads above. The implementation signature is not part
of the public surface.

### Command rename: `styleProperty` -> `styleProp`

The props key for custom properties is `styleProp`. The existing standalone
command is named `styleProperty`. To make the two surfaces symmetric the command is
renamed to `styleProp`, so the props key and the command share one name for every
entry:

| Props key   | Command        |
|-------------|----------------|
| `id`        | `id`           |
| `val`       | `val`          |
| `class`     | `toggleClass`  |
| `style`     | `style`        |
| `styleProp` | `styleProp`    |
| `on`        | `on`           |

This is a breaking rename of an exported symbol (`src/patch.ts:95`), with no
back-compat alias. It affects the README and `src/test/patch.test.ts`; there are
no other call sites in the repo.

## Design

### Form discrimination

`ToAnyPatchItem` is a function; a props object is a plain object. At runtime the
first argument is classified by `typeof first === 'function'`:

- no argument -> empty items (current `patch()` behaviour);
- function -> the existing vararg path, items are used as-is;
- object -> desugar into items, then append any vararg items.

Because patch items are always functions this test is unambiguous. The
`PatchProps` index signature cannot make a props object callable.

### Desugaring

The props object is expanded, in key-insertion order, into the existing command
factories, and the resulting items are concatenated with the vararg items:

| Props key   | Emitted per entry                                  |
|-------------|----------------------------------------------------|
| `id`        | `id(value)`                                        |
| `val`       | `val(value)`                                       |
| `class`     | `toggleClass(value, token)` for each token         |
| `style`     | `style(value, key)` for each key                   |
| `styleProp` | `styleProp(value, key)` for each key               |
| `on`        | `on(type, listener)` for each type                 |
| other       | `attr(value, key)`                                 |

A reserved key is consumed once, never also emitted as an arbitrary attribute.
Keys whose value is `undefined` are skipped, so explicitly passing
`{id: undefined}` emits nothing. `class` uses the same truthiness rule as
`toggleClass` (`Boolean(value)`), so a reactive map entry adds when truthy and
removes when falsy.

Arbitrary attribute values are always `attr()`: `setAttribute(key, String(value))`,
static or `Sig`. This deliberately reuses `attr` semantics; in particular
`patch({disabled: false})` sets `disabled="false"` rather than removing it.
Nullish handling and property-vs-attribute detection are out of scope.

### What does not change

`Patch`, `PatchItem`, `PatchContext`, `ToAnyPatchItem`, `commitPatch`,
`_toPatchItem`, the bind queue, and every command body. The props form produces
ordinary patch items, so mount-time application, per-`Sig` binds, update queueing,
and `cleanBinds` teardown are inherited without modification. `html` already
treats a `Patch` in attribute position, so it needs no change.

No new error codes. The keyless-command guards (`E4`) cannot trigger from props
because the desugarer always supplies the key internally.

### Ordering

Items run in insertion order of the props object, followed by the vararg items.
This matches the existing `patch(a, b)` contract and keeps last-write-wins
predictable when a user mixes `class` with `toggleClass`, or an attribute with an
explicit `attr`.

## Testing

Add cases to `src/test/patch.test.ts`:

- static props: `id`, `val`, and an arbitrary attribute;
- reactive `id` / `val` / arbitrary attribute update after `Sig.update`;
- `class` map: truthy adds, falsy removes, and a reactive entry toggles on update;
- reactive `style` and `styleProp` values update;
- `on` registers a listener that fires;
- composition: `patch({id}, attr(...))` applies both;
- empty props (`patch({})`) is a no-op patch;
- explicit `undefined` values are skipped.

The existing `styleProperty` tests are updated to the new `styleProp` name.

## Docs

Update the `patch` section of the README to document the props form, the reserved
keys, the desugaring table, and the `styleProperty` -> `styleProp` rename. The
`styleProperty` heading and signature block are renamed.

## Acceptance criteria

1. `patch({...})` and `patch({...}, ...items)` type-check and behave as above.
2. `patch(...items)` is unchanged, including zero arguments.
3. Reactive values in every supported position re-apply on signal change and
   detach on teardown through the existing mechanism.
4. `styleProperty` is renamed to `styleProp` in source, tests, and README.
5. `pnpm test` and `pnpm typecheck` pass.
