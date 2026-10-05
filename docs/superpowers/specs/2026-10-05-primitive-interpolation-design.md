# Primitive interpolation in `html`

Date: 2026-10-05

## Motivation

Today every dynamic content position must be wrapped explicitly:

```ts
html`<p>Hello, ${text(name)}!</p>`;
```

The template author already knows the value is text; making them call `text()` is
friction, and the most common case reads better unwrapped:

```ts
html`<p>Hello, ${name}!</p>`;
```

The goal is to let `html` content interpolations accept plain values and `Sig`s
directly, without changing the binding model or the template cache. This is the
first of five proposed API ergonomics changes and is deliberately scoped to `html`
interpolations only.

## API

`html` items widen from `(Patch | AnyView)[]` to accept text values and signals:

```ts
type TextValue = string | number | boolean | bigint | null | undefined;
type HtmlItem = Patch | AnyView | TextValue | Sig<any>;

export const html = (
  strs: TemplateStringsArray,
  ...items: HtmlItem[]
): View;
```

`TextValue` and `HtmlItem` are internal aliases, not exported. `Sig<T>` is
invariant because of its private `_eq: Eq<T>` field, so `Sig<string>` is not
assignable to `Sig<unknown>`. `HtmlItem` uses `Sig<any>` instead, consistent
with `AnyView = View<any, any>`.

### Normalization policy

- a `Patch` or `AnyView` passes through untouched;
- a `Sig` becomes a reactive text node (`text(sig)`), updating on change;
- every other value becomes a static text node via `String(value)`, so
  `null`, `undefined`, and `false` render as `"null"`, `"undefined"`, and
  `"false"` — matching `text(String(item))`.

This mirrors the existing `text` contract exactly, which already handles `Sig`
reactively and `String()`s everything else.

## Design

### Form discrimination

Two small guards classify an item by its discriminant:

```ts
const isPatch = (item: unknown): item is Patch =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'patch';

const isView = (item: unknown): item is AnyView =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'view';
```

Both `Patch` and `View` are plain objects carrying a `type` discriminant, so a
prototype check is not needed. The `typeof === 'object' && item !== null` guard
keeps primitive values and `null` from being dereferenced.

### Normalization

Normalization happens once, at the top of `html`, before the template cache is
consulted and before `_shape`, `_text`, and `_scan` run:

```ts
const toItem = (item: unknown): Patch | AnyView =>
  isPatch(item) || isView(item) ? item : text(item);

const items = rawItems.map(toItem);
```

The helper's parameter is `unknown` so the `else` branch calls `text` with a
value typed `unknown`; `text`'s generic infers `T = unknown` and accepts it
without a cast.

`text(item)` is the single source of truth for turning a value into a view: it
creates a text node, binds reactively when `item` is a `Sig`, and stringifies the
rest. Reusing it avoids a second implementation of the same logic.

### Cache, shape, and markers

Everything downstream is unchanged. Normalization preserves the item count and
order, and every normalized item carries a `.type`, so:

- the `E11:<expected>:<got>` slot-count check still compares against the same
  number of items;
- `_shape`'s bitmask (and its >31-slot string fallback) sees real view/patch
  discriminants;
- `_toMark`, `_text`, and `_scan` behave exactly as before;
- `wraps.length !== items.length` still triggers `E12`.

A call site that mixes explicit `text()`/`view()` with primitives therefore
produces the same shape as one written entirely with wrappers, and vice versa;
reusing a call site across both forms hits the same cache entry.

### Attribute position

A primitive in an attribute position remains an error. The normalized item is a
view, whose marker is a comment (`<!--MARK-->`) placed inside the tag text, and
no comment node exists in the parsed fragment, so `wraps.length` falls short and
`html` throws `E12`. No new error code is introduced. Authors use `patch({...})`
or `attr()` for attributes, as today.

### Scope

Only `html` normalizes. `view`, `repeat`, `frag`, `list`, and `render` continue
to require explicit `AnyView`/`Patch`, so their callbacks keep their current
contracts.

### Teardown

Auto-created `text` views are appended to `children` like any other view, and
`html`'s `cleanBinds` walks `children` recursively. A `Sig` interpolation's bind
is therefore detached by the existing teardown; no new cleanup path is needed.

## Testing

Add cases to `src/test/html.test.ts`:

- a string interpolation renders as a text node (`${'hi'}` → `hi`);
- a number renders (`${42}` → `42`);
- `null`, `undefined`, and `false` render `"null"`, `"undefined"`, `"false"`;
- a `Sig` interpolation renders its value and updates after the microtask flush,
  then detaches when the tree is disposed (its bind is removed from the signal);
- mixing an explicit `text(sig)` with a primitive in one template works;
- reusing one call site first with a view and then with a primitive produces the
  same cached shape and both render;
- a primitive in an attribute position throws `E12`.

## Docs

Update the `html` section of the README to list three interpolation kinds (View,
Patch, text value/`Sig`), state the `String()` policy including nullish values,
and note that primitives are content-only.

## Acceptance criteria

1. `html` accepts `TextValue` and `Sig` content interpolations and renders them
   as text nodes.
2. `Sig` interpolation is reactive and tears down through the existing bind
   machinery.
3. `null`/`undefined`/`false` stringify rather than being skipped.
4. `Patch`/`View` interpolations and the template cache are unchanged; attribute
   primitives still throw `E12`.
5. `pnpm test` and `pnpm typecheck` pass.
