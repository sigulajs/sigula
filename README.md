# Sigula

> Tiny web framework with fine-grained signal reactivity.

A minimal, signal-based web framework with fine-grained reactivity. No virtual DOM — just direct, minimal updates to the real DOM.

```ts
import {html, on, patch, render, sig, text} from 'sigula';

const count = sig(0);

render(
  html`<p>${count}</p>
       <button ${patch(on('click', () => count.trans((v) => v + 1)))}>+1</button>`,
  document.querySelector('#app')!,
);
```

## ✨ Features

- **Fine-grained signal reactivity** — when a signal changes, only the DOM nodes that actually depend on it are updated, not the whole component tree.
- **Declarative sources + precise bindings** — describe state with signals, then bind them precisely to a text node, an attribute, or an effect.
- **No virtual DOM** — no VNodes, no diffing, no reconciliation pass. Direct real DOM operations.
- **Native string templates** — `html` is a tagged template over plain JavaScript strings. No custom compiler, no JSX transform, no `.vue` files.
- **Batched, coalesced updates** — writes are queued in a microtask; a signal touched many times before the flush runs each dependent binding once, against the final value.
- **Ultra small** — ~4.5KB minified + gzipped, with an API surface you can read in one sitting.
- **TypeScript first** — full type inference for signals, template bindings, and patch commands.
- **Zero tooling** — ESM-only, `sideEffects: false`, no build step required to author components.

## Installation

```sh
npm install sigula
pnpm add sigula
yarn add sigula
```

Sigula is ESM-only and ships type declarations. Importing the module is side-effect free; the DOM is only touched when you actually render.

## Quick Start

### 1. Render something

```ts
import {html, render} from 'sigula';

const app = document.querySelector('#app')!;

render(html`<h1>Hello, world!</h1>`, app);
```

`html` returns a `View` — a real `DocumentFragment` plus the metadata Sigula needs to update it later. `render(view, node)` appends it and returns a disposer.

### 2. Make it reactive

```ts
import {html, render, sig} from 'sigula';

const name = sig('Alice');

render(html`<h1>Hello, ${name}!</h1>`, app);

// Only the text node inside <h1> is updated.
name.update('Bob'); // → "Hello, Bob!"
```

A `Sig` interpolated in a **content position** is upgraded to a `text()` view automatically, so `${name}` and `${text(name)}` are equivalent.

### 3. Handle events and patch attributes

Dynamic values in an **attribute position** must be wrapped in `patch(...)`:

```ts
import {compute, html, on, patch, render, sig, style, text} from 'sigula';

const count = sig(0);
const color = compute(count, (v) => (v >= 0 ? 'green' : 'red'));

render(
  html`<p ${patch(style('color', color))}>${text(count)}</p>
       <button ${patch(on('click', () => count.trans((v) => v + 1)))}>+1</button>
       <button ${patch(on('click', () => count.trans((v) => v - 1)))}>-1</button>`,
  app,
);
```

### 4. Split into components

There is no component class, no lifecycle, no registration. **A component is just a function that returns a `View`.** It runs once, wires up bindings, and is never called again.

```ts
import {html, on, patch, render, sig, type View} from 'sigula';

const Counter = (initial: number): View => {
  const count = sig(initial);
  return html`<div>
    <span>${count}</span>
    <button ${patch(on('click', () => count.trans((v) => v + 1)))}>+1</button>
  </div>`;
};

render(html`<main>${Counter(0)} ${Counter(100)}</main>`, app);
```

Because the function body runs exactly once, `sig(initial)` *is* the local state — no hooks, no `this`, no re-run semantics to reason about.

### 5. Render lists conditionally

```ts
import {compute, html, on, patch, render, repeat, sig, text, val, view} from 'sigula';

interface Todo { id: number; text: string; done: boolean }

const Todos = () => {
  const input = sig('');
  const todos = sig<Todo[]>([]);
  const filter = sig<'all' | 'active'>('all');

  const visible = compute({todos, filter}, (v) =>
    v.filter === 'active' ? v.todos.filter((t) => !t.done) : v.todos,
  );
  const isEmpty = compute(visible, (v) => v.length === 0);

  const add = (e: Event) => {
    e.preventDefault();
    if (!input.get().trim()) return;
    todos.trans((items) => [...items, {id: Date.now(), text: input.get().trim(), done: false}]);
    input.update('');
  };

  return html`<form ${patch(on('submit', add))}>
      <input ${patch(val(input), on('change', (e) => input.update((e.target as HTMLInputElement).value)))} />
      <button>Add</button>
    </form>
    ${view(isEmpty, (empty) =>
      empty
        ? text('Nothing here yet')
        : html`<ul>${repeat(visible, {
            key: (t) => t.id.toString(),
            view: (t) => html`<li>${text(t.text)}</li>`,
          })}</ul>`,
    )}`;
};

const dispose = render(Todos(), app);
dispose(); // detaches every binding and removes the nodes
```

Runnable versions live in [`examples/`](./examples) (`equation`, `filtertodos`).

## 🧠 Core Concepts

### The whole architecture in one picture

```
        ┌──────────────── Core Concepts ────────────────┐
        │                                               │
  Sig ──┤  holds a value + a list of Binds              │  state
        │                                               │
  Bind ─┤  { sig, context, cmd }                        │  the edge
        │                                               │
  Cmd ──┤  (value, context) => void                     │  the work
        │                                               │
  View ─┤  { node, boundary(), cleanBinds() }           │  DOM region
  Patch ┤  deferred commands for one element            │
        │                                               │
  Queue ┤  one global microtask, coalesced per Bind     │  scheduling
        └───────────────────────────────────────────────┘
```

Everything else in the library is a convenience layer over these five pieces. Read the rest as: *how do I create a `Bind`, and what `Cmd` should it run?*

### Signals: `sig`

A `Sig<T>` is a value container that owns a list of **bindings**. It never touches the DOM itself.

```ts
const count = sig(0);

count.get();              // 0 — read the current value
count.update(1);          // set; dependents notified only if not deeply equal
count.update(1);          // no-op: deeply equal, nothing is scheduled
count.forceUpdate(1);     // set and always notify (even when equal)
count.trans((v) => v + 1);// apply a function to the current value
count.notify();           // re-run dependents without changing the value
```

| Method | Purpose |
| --- | --- |
| `get()` | Read the current value. |
| `update(v)` | Write, skipping the notification when `eq(v, current)`. |
| `forceUpdate(v)` | Write and always notify. Use after a structurally-equal-but-new value. |
| `trans(fn)` | `update(fn(current))` — the idiomatic way to derive the next state. |
| `notify()` | Re-run dependents against the current value. Use after mutating a held object/array **in place**. |
| `addBind` / `removeBind` / `getBinds` | Low-level binding management; prefer `createBind` or the template APIs. |

**Equality is deep by default.** `update` compares with `eq`, a structural comparator covering primitives, arrays, `Date`, `RegExp`, `Map`, `Set` and plain objects, and delegating to `a.equals(b)` when the value implements `Equatable`. Replacing `{a: 1}` with another `{a: 1}` is therefore a no-op. Values with different prototypes are never equal. `sig(v, {eq})` accepts a custom comparator.

**In-place mutation needs `notify()`.** Sigula does not proxy your objects. If you mutate a held array or object instead of replacing it, the value identity never changes and `update` cannot see it:

```ts
const items = sig<string[]>([]);
items.get().push('a');   // value object mutated, no write detected
items.notify();          // ← tell dependents to re-run
```

### Bindings: the unit of reactivity

A binding is a three-field record — that is the entire reactive primitive:

```ts
interface Bind<T, C> {
  sig: Sig<T>;           // what it observes
  context: C;            // where the result goes (a text node, an element, …)
  cmd: (val: T, ctx: C) => void;  // what to do with the new value
  removed: boolean;
  queued?: boolean;
}
```

So "fine-grained" is literal: `text(name)` creates a bind whose `context` is one `Text` node and whose `cmd` is `node.textContent = String(val)`. Nothing else in the tree is involved.

```ts
const name = sig('Alice');
const v = text(name);   // Bind{ sig: name, context: {node: <Text>}, cmd: textCmd }

name.update('Bob');     // → textCmd('Bob', {node}) → that one node changes
```

Because a `Cmd` is just a function, the same model covers DOM writes, derived values, and arbitrary side effects. The `effect(source, fn)` helper is thin sugar over `createBind` for the common standalone case: it runs `fn` immediately and again on change, and returns a disposer.

### Derived signals: `compute`

`compute` returns a `DerivedSig<T>`, which is a `Sig` you cannot write to. Two overloads:

```ts
const x = sig(1);
const doubled = compute(x, (v) => v * 2);          // from one signal

const sum = compute({x, y}, (v) => v.x + v.y);     // from a record of signals
```

With the record form, `fn` receives the matching record of *values* (`ValRecord<S>`), fully typed. Derived signals compose: a `DerivedSig` is a valid source for another `compute`, and a valid interpolation target in a template.

Derived signals are **lazy about upstream**. A `DerivedSig` detaches from its sources when it loses its last consumer (which happens whenever a `view()` subtree is hidden), and re-links and recomputes once when a consumer comes back. You get the memory savings without manual disposal.

### Templates: `html`

```ts
const html = (strs: TemplateStringsArray, ...rawItems: HtmlItem[]): View;
```

`html` is a tagged template over **native HTML strings** — no compiler, no DSL, no JSX pragma. Interpolations fall into two positions, and the distinction is the one rule to memorize:

| Position | What goes there | Example |
| --- | --- | --- |
| **Content** (child slot) | a `View`, `text`, `raw`, a `Sig`, or any primitive | `` html`<h1>${name}</h1>` `` |
| **Attribute** (inside a tag) | a `Patch` from `patch(...)` | `` html`<input ${patch(val(name))} />` `` |

Anything interpolated in a content position that is not already a `View` or `Patch` is coerced with `text()`, i.e. escaped and rendered as `String(value)`:

```ts
const sigItem  = sig('signal item');
const strItem  = 'string data';
const numItem  = 2026;
const htmlItem = html`<span>Html Span Element</span>`;

render(
  html`<p>${sigItem} / ${strItem} / ${numItem}</p>
       <div>${htmlItem}</div>
       <div>${raw('<strong>Trusted</strong> HTML')}</div>`,
  app,
);

sigItem.update('string with <strong>markup</strong>'); // stays escaped — renders as text
```

`raw(source)` parses its value through a detached `<template>` and mounts the resulting nodes with no wrapper element. **It does not escape** — only ever pass trusted HTML.

#### How parsing works (and why it is fast)

Every call site gets a random marker, `@sig_<rand>`. Interpolations are rendered into the template string as:

- an **attribute marker** `@sig_x` for a `Patch`,
- a **comment marker** `<!--@sig_x-->` for a `View`.

```html
<div @sig_2734618> <!--@sig_2734618--> <!--@sig_2734618--> </div>
```

Therefore parsing needs no regular expressions: Sigula walks the parsed fragment with a single `TreeWalker`, collects each marker node in order, and commits the matching item (`commitPatch` for elements, `commitView` for comments). The uniform format is also what makes the API extensible — `id`, `on`, `attr`, `style` are all just patch items, and you can write your own.

Two consequences worth knowing:

1. **One `Patch` per element.** The marker is an attribute, so a second `patch()` on the same element cannot be located. Combine everything into a single `patch(...)` call — that is what its variadic form is for.
2. **Templates are cached per call site** (a `WeakMap` on the `TemplateStringsArray`), and the cache key includes the *mix* of patch/view slots (a bitmask for up to 31 slots, a string beyond that). Repeated renders skip parsing entirely; a call site that changes its interpolation mix simply gets a fresh template.

The returned `View` is `{node, children, boundary(), cleanBinds()}` — see [Boundaries](#boundaries-and-teardown).

### Patching an element: `patch`

`patch` declares bindings to apply to **one** element. It accepts either a props object, or a list of command items, or both:

```ts
// Props form — desugared into commands
html`<input ${patch({id: 'name', val: name, placeholder: 'Your name'})} />`

// Command form
html`<input ${patch(val(name), attr('placeholder', placeholder))} />`
```

The props object handles `id`, `val`, `class`, `style`, `styleProp`, `on`; any other key becomes an attribute. A key whose value is `undefined` is skipped.

| Command | What it does |
| --- | --- |
| `id(source)` | Sets `element.id`. |
| `val(source)` | Sets the `value` **property** (form controls). |
| `attr(key, source)` | `setAttribute(key, …)` — for boolean/ARIA/data attributes. |
| `style(key, source)` | Sets a typed inline style property. |
| `styleProp(key, source)` | `style.setProperty` — for `--custom-properties`. |
| `toggleClass(token, source)` | Toggles one class from the truthiness of the value. |
| `toggleClasses(tokens, source)` | Toggles several classes from one value. |
| `on(type, listener, options?)` | `addEventListener`. |
| `act(source, fn)` | Escape hatch: run arbitrary code with `(element, value)`. |

Every command takes a plain value (applied once at mount) **or** a `Sig` (applied at mount and re-applied on change):

```ts
const disabled = sig(false);
const label = 'Submit';

html`<button ${patch(attr('disabled', disabled), attr('aria-label', label))}>Go</button>`
//                    ↑ reactive                  ↑ static
```

Note that `on` registers the listener **once at mount**; the listener itself is not a reactive source. Drive updates by writing to a signal inside it.

### Control flow

Sigula has exactly four control-flow helpers, all returning a `View`:

| Helper | Use it for |
| --- | --- |
| `view(sig, viewFn)` | Swap one view for another when `sig` changes (conditional rendering). |
| `repeat(sig, {key, view, eq?})` | Keyed list rendering with minimal DOM reuse/moves. |
| `list(items, viewFn)` | A **static** array rendered once — no keying, no reconciliation. |
| `frag(...views)` | Compose several views as flat siblings with no wrapper element. |

```ts
// conditional
${view(isEmpty, (empty) => (empty ? text('empty') : listView))}

// keyed list
${repeat(todos, {
  key: (t) => t.id.toString(),
  view: (t) => html`<li>${text(t.text)}</li>`,
  eq: (a, b) => a.id === b.id && a.text === b.text, // optional, defaults to eq
})}
```

`repeat` matches items by `key` with a two-pointer walk, reusing, moving, creating, or removing as few nodes as possible, and uses `moveBefore` when available to preserve element state across moves. When nothing changed — same keys, same order, equal items — it bails out before touching the DOM at all. Use `list` instead when the array never changes shape.

### Boundaries and teardown

A `View` occupies a contiguous **range of sibling nodes**, described by `boundary(): {start, end}`. This is how Sigula swaps or removes multi-node regions without a wrapper element or a virtual tree.

Teardown is explicit and recursive:

```ts
const dispose = render(App(), app);
dispose();   // removeBoundary(view.boundary()) + view.cleanBinds()
```

`cleanBinds()` detaches the view's own bind and, recursively, all child binds. When a `Sig` loses its last bind it calls `cleanup()`, so a subtree that is removed stops receiving updates immediately — no manual effect cleanup, no leak by default.

### The update queue

Writes never run synchronously. Every write pushes the signal's binds onto one global queue and schedules a single `queueMicrotask`.

```ts
sig0.update(a);   // ┐
sig1.update(b);   // ├── one microtask
sig2.update(c);   // ┘

sig.update(1); sig.update(2); sig.update(3);  // each dependent binding runs ONCE, against 3
```

- **Batched** across signals — many writes, one flush.
- **Coalesced per binding** — a `queued` flag keeps a bind from entering the queue twice; since `cmd` reads `sig.get()` at call time, it always sees the newest value.
- **Error-isolated** — a throwing bind is logged (`console.error('[Queue] task failed:', …)`) and the rest of the queue still runs.

### What Sigula deliberately does not have

| Not included | Why |
| --- | --- |
| Virtual DOM / diffing | Updates are bound at mount time; there is nothing to diff. |
| A component instance or lifecycle | A component is a function that returns a `View`, and it runs once. |
| A compiler / build step | Templates are native tagged-template strings. |
| A router, store, or SSR runtime | Out of scope. Sigula is the rendering and reactivity layer; bring your own. |
| Proxy-based deep reactivity | Values are compared, not wrapped. Mutate in place and call `notify()`. |
| Automatic dependency tracking | Bindings are explicit (`sig` → `cmd` → target), which is what keeps the runtime at ~4.5KB. |

## 📖 API Cheat Sheet

Full signatures and documentation: [Reference.md](./Reference.md).

| Export | Kind | Returns |
| --- | --- | --- |
| `sig(v, opts?)` | state | `Sig<T>` |
| `compute(sig, fn)` / `compute(record, fn)` | derived | `DerivedSig<T>` |
| `effect(sig \| record, fn)` | side effect | disposer `() => void` |
| `html\`…\`` | template | `View` |
| `text(source)` | template | `View` (escaped text node) |
| `raw(source)` | template | `View` (**unescaped** HTML) |
| `patch(props \| …items)` | binding | `Patch` |
| `id`, `val`, `attr`, `style`, `styleProp`, `toggleClass`, `toggleClasses`, `on`, `act` | patch commands | `ToPatchItem<T>` |
| `view(sig, viewFn)` | control flow | `View` |
| `repeat(sig, {key, view, eq?})` | control flow | `View` |
| `list(items, viewFn)` | control flow | `View` (static) |
| `frag(...views)` | composition | `View` |
| `render(view \| () => view, node)` | mounting | disposer `() => void` |
| `createBind`, `removeBind`, `eq`, `toBoundary`, `walkBoundary`, `toPatchItem` | low-level | — |
| `Sig`, `DerivedSig`, `View`, `Patch`, `Reactive<T>`, `Eq<T>`, `Equatable` | types | — |

The full API reference is generated from the TSDoc comments in the source: see [Reference.md](./Reference.md).

## Errors

Runtime errors carry a short code in `message` instead of a sentence, so the string tables stay out of the bundle. Codes with arguments are colon-separated.

| Code | Thrown by | Meaning |
| --- | --- | --- |
| `E1:<index>` | `at` | Array index out of range. |
| `E2` | `toBoundary` | Cannot build a boundary from an empty fragment. |
| `E3` | `replaceWithNode` | The old boundary has no `parentNode`. |
| `E4` | `patch` | A keyed command (`attr`, `style`, `styleProp`, `toggleClass`) was given no key. |
| `E5` | `patch` | `act` was given no function. |
| `E6` | `patch` | `on` was given no event type. |
| `E7` | `repeat` | The rendered items have no parent node. |
| `E8` | `repeat` | The temporary start/end fences were removed mid-update. |
| `E9` | `repeat` | There is no node after the fence to move before. |
| `E10` | `html` | The template is empty (an empty tagged template). |
| `E11:<expected>:<got>` | `html` | Interpolation count does not match the template's slots. |
| `E12` | `html` | Unmatched interpolation: a `Patch` must sit in an attribute position, a `View`/text value in a content position. |
| `E13` | `html` | A `View` was committed more than once (reused across templates). |

## How it compares

|  | Sigula | Lit | Solid | React |
| --- | --- | --- | --- | --- |
| Update model | Signal → bind → DOM node | Property → `render()` → part commit | Signal → compiled DOM | Component re-render → VDOM diff |
| Compiler required | No | No | Yes (JSX/babel) | Yes (JSX) |
| Component re-runs | Never | On property change | Never | On every state change |
| Approx. size | ~4.5KB min+gzip | ~5KB | ~7KB | — (much larger runtime) |
| Templating | Native tagged templates | Tagged templates | JSX | JSX |
| Standard Web Components | No (any DOM node) | Yes | No | No |

*Size figures are each project's own published claim, measured with different tooling and feature sets — treat them as an order of magnitude, not a benchmark.*

## License

MIT
