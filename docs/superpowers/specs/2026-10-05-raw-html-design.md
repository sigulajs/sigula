# Raw HTML with `raw`

Date: 2026-10-05

## Motivation

`text` always creates a text node, so any HTML in its value is escaped. There is
no supported way to hand the framework a trusted HTML string and have it parsed
into real DOM. This is needed for cases like server-rendered snippets or
sanitized reST/Markdown output:

```ts
html`<article>${raw(post.bodyHtml)}</article>`;
```

This is the third of five proposed API ergonomics changes. It is explicitly an
escape hatch: `raw` does not sanitize or escape.

## API

```ts
export const raw = (source: string | Sig<string>): View;
```

- `source` is a `string` (static) or a `Sig<string>` (reactive).
- `raw` returns a content-position `View`; it is not valid in an attribute
  position.

## Design

### Parsing

The value is stringified with `String(value)` and parsed by assigning it to a
detached `<template>`'s `innerHTML`, then reading `template.content`. This is the
standard, side-effect-free way to turn an HTML string into nodes; scripts
inserted this way do not execute.

The parse result is a `DocumentFragment`:

- non-empty → `template.content` (the parsed `DocumentFragment`);
- empty (an empty string, so the parse yields no nodes) → a single empty
  `document.createTextNode('')`, so the view always has a valid boundary anchor
  and renders nothing.

Using the fragment's child nodes directly (no wrapper element) keeps the DOM
structure clean, so `raw` can produce, for example, a `<tr>` or a block of
siblings without an extra element around them.

### Reactivity

With a `Sig`, `raw` behaves like `text`: it creates its initial content eagerly
and registers a bind through `createBind`. A `RawContext` holds the view's
current `boundary`:

```ts
interface RawContext extends CmdContext {
  boundary: Boundary;
}
```

The command re-parses the new value, calls
`replaceWithNode(ctx.boundary, content)` (which removes the current nodes and
inserts the new ones) and stores the returned boundary back on the context. The
view exposes `boundary: () => ctx.boundary`, so disposal always targets the
nodes currently mounted, including after a change from empty to non-empty or
back. Plain-string sources are static and register no bind.

### Safety

`raw` deliberately does not escape or sanitize. Its documentation will state
that it must only be given trusted HTML; untrusted input must be sanitized by the
caller. This is the same contract as `dangerouslySetInnerHTML` / `unsafeHTML`.

### Interactions

- In an `html` content position, the marker comment is replaced by the initial
  fragment's children.
- As a `render` root, the fragment is appended and disposal uses the current
  boundary from the context.
- In a `view()` subtree, `cleanBinds` removes the bind; re-showing rebuilds a
  fresh `raw` view, so no stale boundary is reused.

### What does not change

No change to `html`, `text`, `view`, `repeat`, `list`, or anything in `core`.
`raw` is built from the existing `createBind`, `removeBind`, `toBoundary`,
`replaceWithNode`, `Boundary`, `View`, and `CmdContext`. The only edit to an
existing source file is adding `export * from './raw';` to `src/index.ts`. No new
error codes: empty input is handled by the empty text node.

## Testing

Create `src/test/raw.test.ts`:

- static `raw('<b>hi</b>')` mounts `<b>hi</b>` with no wrapper element;
- multiple root nodes (`'a<b>b</b>'`) render in order;
- `raw` in an `html` content position works and keeps following siblings;
- a `Sig` update replaces the previous content rather than appending, and works
  across changing node counts (e.g. empty → several nodes → empty);
- `raw('')` renders nothing, and a later non-empty value mounts correctly;
- disposing a reactive `raw` clears its bind (`sig.getBinds().length === 0`) and
  removes its nodes.

## Docs

Add a `raw` subsection to the README's Templates section: the signature, an
example, the no-wrapper fragment behavior, and a prominent trusted-HTML warning.
Add `raw` to the existing View-producer enumerations in the `html` and `View`
sections.

## Acceptance criteria

1. `raw(string)` and `raw(Sig<string>)` mount parsed HTML as real DOM with no
   wrapper element.
2. A `Sig` change replaces the current nodes and keeps the view's boundary
   correct across empty/non-empty transitions.
3. `raw('')` renders nothing and does not throw.
4. Disposal removes the bind and the mounted nodes.
5. No existing source other than `src/index.ts` (`raw` export) is modified, and
   `pnpm test` / `pnpm typecheck` pass.
