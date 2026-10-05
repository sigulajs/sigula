# Patch command argument order: key first

Date: 2026-10-05

## Motivation

The binding commands are inconsistent about which argument comes first. `on` and
`id`/`val` are effectively "specifier first", but `attr`, `style`, `styleProp`,
and the class toggles take the reactive value first and the key/token second:

```ts
attr(placeholder, 'name');
style(color, 'color');
```

HTML itself is `key=value`, so the key-first form reads the way the element is
written and matches `on(type, listener)`:

```ts
attr('name', placeholder);
style('color', color);
```

This is the fifth proposed API ergonomics change. It is a hard breaking change:
there is no reliable runtime heuristic to accept both orders, because a string
key and a string value are indistinguishable.

## API

New signatures in `src/patch.ts`:

```ts
export const attr: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
export const style: <T>(
  key: WritableStyleKey,
  source: T | Sig<T>,
) => ToPatchItem<T>;
export const styleProp: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
export const toggleClass: <T>(
  token: string,
  source: T | Sig<T>,
) => ToPatchItem<T>;
export const toggleClasses: <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
) => ToPatchItem<T>;
```

### Unchanged

- `id(source)`, `val(source)` — single argument.
- `act(source, fn)` — the second argument is a callback, not a name, so it stays
  source-first. This is a deliberate exception, not an oversight.
- `on(type, listener, options)` — already type-first.
- `patch(...)` and `PatchProps` — the props object keys and desugaring table are
  unchanged; only the internal command calls are reordered.

## Design

### Factories

Each factory keeps its existing helper and only reorders parameters:

```ts
export const attr = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, [key], attrCmd);
```

`style`, `styleProp`, and `toggleClass` follow the same shape.
`toggleClasses` takes the tokens as a `readonly string[]` and passes a mutable
copy as the command's `extra`:

```ts
export const toggleClasses = <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [...tokens], toggleClassesCmd);
```

The command bodies (`attrCmd`, `styleCmd`, `stylePropCmd`, `toggleClassCmd`,
`toggleClassesCmd`) are unchanged: they read the key from `ctx.extra` and the
value from their first parameter. `_toPatchItem`, `PatchContext`, `Patch`, and
the keyless-command guard `E4` are unchanged.

### `PatchProps` desugaring

`_propsToItems` calls the commands in the new order:

| Props key | Emitted |
| --- | --- |
| `id` | `id(value)` |
| `val` | `val(value)` |
| `class` | `toggleClass(token, v)` |
| `style` | `style(name, v)` |
| `styleProp` | `styleProp(name, v)` |
| `on` | `on(type, listener)` |
| other | `attr(key, value)` |

The public `PatchProps` shape and its README table are unchanged.

### Scope of the change

All call sites move to the new order; there are no aliases or overloads:

- `src/patch.ts` — factories and `_propsToItems`.
- `src/test/patch.test.ts` — `attr`/`style`/`styleProp`/`toggleClass`/`toggleClasses`
  call sites.
- `src/test/html.test.ts` — `attr` and `toggleClass` call sites.
- `README.md` — the `attr`, `style`, `styleProp`, `toggleClass`, `toggleClasses`
  signature blocks and examples, plus the Quick Start `style(...)` example.

The example app `examples/filtertodos` is a standalone project pinned to the
released `sigula@1.0.3`. It is intentionally left on the old order so it keeps
compiling against its pinned dependency, and is updated when the next version is
released. `package.json`'s version is not changed here.

## Testing

The existing suites already assert command behavior; updating their call sites to
the new order is the regression check. After the change:

- `pnpm test` and `pnpm typecheck` pass;
- a repository search finds no remaining calls in the old order (a call whose
  first argument is a `Sig`/`Reactive` and second is a string key).

No new tests are needed beyond the updated call sites, unless a reviewer finds a
command body that assumed the old order (none do).

## Docs

Update every README signature block and example to key-first, and keep the
`toggleClasses` signature showing the `readonly string[]` tokens argument. Add no
migration section (breaking change accepted without a compat shim).

## Acceptance criteria

1. `attr`, `style`, `styleProp`, `toggleClass`, `toggleClasses` accept the key(s)
   first and the value second, as above.
2. `id`, `val`, `act`, `on`, `patch`, and `PatchProps` are unchanged in behavior
   and signature.
3. `_propsToItems` emits the new order and all props-based behavior is unchanged.
4. All tests and typecheck pass, and no old-order call sites remain in `src`,
   tests, or the README. The example app stays pinned to `sigula@1.0.3` and keeps
   the old order until the next release.
