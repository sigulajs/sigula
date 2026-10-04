# Sigula

> Tiny web framework with fine-grained signal reactivity.

A minimal, signal-based web framework with fine-grained reactivity. No virtual DOM — just direct, minimal updates to the real DOM.

## ✨ Features

- Fine-grained signal reactivity — when state changes, only the DOM nodes that actually depend on it are updated, not the whole component tree
- Declarative signal sources + precise bindings — describe data sources declaratively with signals, then bind them precisely to the DOM or any effect
- No virtual DOM — no diffing, no VNodes. Direct real DOM operations with minimal runtime overhead
- Minimal HTML templates — based on native string templates. No custom compiler, no DSL — just JavaScript strings
- Batched, coalesced updates — writes are queued in a microtask, so a signal touched many times before the flush runs its bindings once, with the final value
- Ultra small — ~4.0KB minified + gzipped
- TypeScript friendly — full type inference for signals and template bindings
- Simple but performant — tiny API surface, low mental overhead, no compromise on performance

## Installation

```sh
npm install sigula
pnpm add sigula
yarn add sigula
```

## Quick Start

```ts
import {compute, html, on, patch, render, sig, text, type View} from 'sigula';

const Equation = (): View => {
  const x = sig(0);
  const y = sig(1);

  const s = {x, y};
  const sum = compute(s, (v) => v.x + v.y);
  const product = compute(s, (v) => v.x * v.y);
  const diff = compute(s, (v) => v.x - v.y);
  const quotient = compute(s, (v) => v.x / v.y);

  const xSquare = compute(x, (v) => v * v);
  const ySquare = compute(y, (v) => v * v);

  const sumDiffProduct = compute({sum, diff}, (v) => v.sum * v.diff);
  const squareDiff = compute({xSquare, ySquare}, (v) => v.xSquare - v.ySquare);

  return html`<div>
    <h1>Equation</h1>
    <div>
      <p>x: ${text(x)} -
        <button ${patch(on('click', () => x.trans((v) => v + 1)))}>+1</button>
        <button ${patch(on('click', () => x.trans((v) => v - 1)))}>-1</button>
      </p>
      <p>y: ${text(y)} -
        <button ${patch(on('click', () => y.trans((v) => v + 1)))}>+1</button>
        <button ${patch(on('click', () => y.trans((v) => v - 1)))}>-1</button>
      </p>
      <p>sum: x + y = ${text(x)} + ${text(y)} = ${text(sum)}</p>
      <p>difference: x - y = ${text(x)} - ${text(y)} = ${text(diff)}</p>
      <p>product: x * y = ${text(x)} * ${text(y)} = ${text(product)}</p>
      <p>quotient: x / y = ${text(x)} / ${text(y)} = ${text(quotient)}</p>
      <p>
        (x + y)(x - y)
          = (${text(x)} + ${text(y)})(${text(x)} - ${text(y)})
          = ${text(sum)}*${text(diff)} = ${text(sumDiffProduct)}
        <br />
        = x^2 - y^2 = ${text(xSquare)} - ${text(ySquare)} = ${text(squareDiff)}
      </p>
    </div>
  </div>`;
};

const appNode = document.querySelector('#app');
if (!appNode) throw new Error('#app not found');
render(Equation(), appNode);
```

## 🧠 Core Concepts

### Fine-grained updates to the real DOM

Traditional frameworks like React re-run component functions, generate a virtual DOM, diff it, and finally apply changes to the real DOM. Sigula works completely differently:

```ts
import {html, text} from 'sigula';

const name = sig('Alice');

const App = html`<h1>Hello, ${text(name)}!</h1>`;

// When name changes, only the text node inside <h1> is updated
name.update('Bob'); // → the text changes from "Hello, Alice!" to "Hello, Bob!"
```

Only the exact text node that depends on `name` is updated. Everything else stays untouched.

### Declarative signal sources + precise bindings

Signals are the single source of truth. Every view and side effect is derived from them:

```ts
import {
  compute,
  html,
  on,
  patch,
  render,
  repeat,
  type Sig,
  sig,
  style,
  text,
  type View,
  val,
  view,
} from 'sigula';

interface Todo {
  id: number;
  text: string;
  done: Sig<boolean>;
}

const Todos = (): View => {
  const input = sig('');
  const todos = sig<Todo[]>([]);
  const filter = sig<'all' | 'active' | 'done'>('all');

  // Derived Signals
  const visibleTodos = compute({todos, filter}, (v) => {
    switch (v.filter) {
      case 'active':
        return v.todos.filter((t) => !t.done.get());
      case 'done':
        return v.todos.filter((t) => t.done.get());
      default:
        return v.todos;
    }
  });

  const isEmpty = compute(visibleTodos, (v) => v.length <= 0);

  const addTodo = (e: Event) => {
    e.preventDefault();
    if (!input.get().trim()) return;

    todos.trans((items) => [
      ...items,
      {id: Date.now(), text: input.get().trim(), done: sig(false)},
    ]);
    input.update('');
  };

  const remove = (id: number) => {
    todos.trans((items) => items.filter((item) => item.id !== id));
  };

  const itemView = (item: Todo) => html`<li>
      <span
        ${patch(
          on('click', () => item.done.trans((v) => !v)),
          style(
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
            'textDecoration',
          ),
        )}
      >${text(item.text)}</span>
      <button ${patch(on('click', () => remove(item.id)))}>x</button>
    </li>`;

  // Bind precisely to the DOM
  return html`<div style="margin: 2rem auto; max-width: 400px">
    <h1>Todos</h1>
    <form ${patch(on('submit', addTodo))}>
      <input ${patch(
        val(input),
        on('change', (e) => {
          if (e.target) input.update((e.target as HTMLInputElement).value);
        }),
      )} />
      <button>Add</button>
    </form>
    <div>
      filter:
      <button ${patch(on('click', () => filter.update('all')))}>all</button>
      <button ${patch(on('click', () => filter.update('active')))}>active</button>
      <button ${patch(on('click', () => filter.update('done')))}>done</button>
    </div>
    ${view(isEmpty, (v) =>
      v
        ? text('empty')
        : html`<ul>${repeat(visibleTodos, {
            key: (item) => item.id.toString(),
            view: (item) => itemView(item),
          })}</ul>`,
    )}
  </div>`;
};

const appNode = document.querySelector('#app');
if (!appNode) throw new Error('#app not found');
render(Todos(), appNode);
```

Signals can bind to the DOM, to effects, or to other computed signals — one reactive model across the entire application.

### No virtual DOM

Sigula does not create VNodes and does not diff trees. During the initial mount, the template establishes direct subscriptions between signals and DOM nodes. Every subsequent signal change goes straight to the corresponding DOM node.

This means:
- No VNode creation or destruction overhead
- No diffing traversal cost
- Memory usage scales linearly with DOM nodes, not with component tree depth

### Minimal HTML templates

Templates are plain JavaScript native string templates. No custom compiler, no `.vue` files, no JSX transform:

```ts
const App: View = html`
  <div class="card">
    <h2>${text(title)}</h2>
    <p>${text(description)}</p>
    <button ${patch(on('click', handleClick))}>Click me</button>
  </div>
`;
```

`html` is a tagged template function that returns a mountable template (`View`) object. You can use any editor's syntax highlighting, formatting, and ESLint rules — no extra tooling required. Templates are cached per call site, so rendering the same template twice only parses it once.

### Ultra small

minified + gzipped: ~4.0KB

## 📖 Reference

All exports are named exports from `sigula`.

- [Reactivity](#reactivity)
- [Templates](#templates)
- [DOM bindings](#dom-bindings)
- [Control flow](#control-flow)
- [Rendering](#rendering)
- [Low-level API](#low-level-api)
- [Errors](#errors)
- [Reactivity model](#reactivity-model)

### Reactivity

#### `sig`

```ts
const sig: <T>(v: T) => Sig<T>;
```

Creates a writable signal holding `v`.

```ts
const count = sig(0);
count.get();          // 0
count.update(1);      // schedules dependents
```

#### `Sig<T>`

The core reactive value.

| Member | Signature | Description |
| --- | --- | --- |
| `get` | `(): T` | Reads the current value. |
| `update` | `(v: T): void` | Sets the value and notifies dependents, but only if `isEqual(v, current)` is `false`. |
| `forceUpdate` | `(v: T): void` | Sets the value and always notifies dependents, even when deeply equal. |
| `trans` | `(fn: (v: T) => T): void` | Applies `fn` to the current value via `update`, so an equal result is skipped. |
| `equals` | `(other: unknown): boolean` | `Equatable` implementation; two `Sig`s are equal when their values are deeply equal. |
| `addBind` | `<C>(bind: Bind<T, C>): void` | Registers a binding. Prefer `createBind` / the `patch`/`text`/`view` APIs. |
| `removeBind` | `<C>(bind: Bind<T, C>): void` | Unregisters a binding; runs `cleanup()` when the last one goes away. |
| `getBinds` | `(): Bind<T, CmdContext>[]` | Returns the current bindings. |
| `cleanup` | `(): void` | Overridable hook called when a signal loses all bindings. No-op on `Sig`. |

#### `DerivedSig<T>`

A `Sig` produced by `compute`. Extends `Sig` and additionally tracks the source bindings that feed it. When it loses its last consumer it detaches from its sources; when a consumer is added again, it re-links to the (possibly moved) source signals and recomputes once.

| Member | Signature | Description |
| --- | --- | --- |
| `addFromBind` | `<S, C>(bind: Bind<S, C>): void` | Registers a source binding. |
| `addBind` | `<C>(bind: Bind<T, C>): void` | Registers a consumer; re-links to sources and recomputes once if the derived signal was detached. |
| `cleanup` | `(): void` | Removes every source binding when the derived signal has no consumers. |

#### `compute`

```ts
function compute<S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T>;
function compute<S extends SigRecord, T>(
  source: S,
  fn: (v: ValRecord<S>) => T,
): DerivedSig<T>;
```

Derives a signal from one source signal, or from a record of signals (whose values are passed as a matching record). The result is recomputed whenever any source changes.

```ts
const x = sig(1);
const y = sig(2);

const sum = compute({x, y}, (v) => v.x + v.y);      // DerivedSig<number>
const doubled = compute(x, (v) => v * 2);           // DerivedSig<number>
```

Supporting types:

```ts
interface SigRecord {
  [key: string]: Sig<any>;
}

type ValRecord<K extends SigRecord> = {
  [P in keyof K]: K[P] extends Sig<infer U> ? U : never;
};
```

`ValRecord` maps a record of signals to the record of their values, which is what `compute`'s record overload passes to `fn`.

#### `isEqual`

```ts
const isEqual: <T>(a: T, b: T) => boolean;
```

Deep structural equality. Compares primitives, arrays, `Date`, `RegExp`, `Map`, `Set`, and plain objects, and defers to `a.equals(b)` when `a` implements `Equatable`. This is the default comparator for `Sig.update` and `repeat`. Two objects with different prototypes are never equal, so instances of different classes and objects from different realms (iframes, workers) always compare unequal.

#### `Equatable`

```ts
interface Equatable {
  equals(other: unknown): boolean;
}
```

Implement this on a value type to give `isEqual` custom semantics.

#### `UnknownRecord`

```ts
type UnknownRecord = Record<string, unknown>;
```

Convenience alias for an arbitrary string-keyed object, used by the equality and signal-record helpers.

#### `createBind` / `removeBind`

```ts
const createBind: <T, C extends CmdContext>(
  sig: Sig<T>,
  context: C,
  cmd: Cmd<T, C>,
) => Bind<T, C>;

const removeBind: <T, C extends CmdContext>(bind: Bind<T, C>) => void;
```

Low-level bind management. `createBind` wires `cmd(sig.get(), context)` to run whenever `sig` changes; `removeBind` detaches it. `Bind` is the resulting record:

```ts
interface Bind<T, C extends CmdContext> {
  sig: Sig<T>;
  context: C;
  cmd: Cmd<T, C>;
  removed: boolean;
  queued?: boolean;
}

type AnyBind = Bind<any, any>;
```

### Templates

#### `html`

```ts
const html: (
  strs: TemplateStringsArray,
  ...items: (Patch | AnyView)[]
) => View;
```

Tagged template that parses native HTML and returns a `View`. Two kinds of interpolation are supported:

- a `View` (from `text`, `view`, `repeat`, or another `html`) fills a content position
- a `Patch` (from `patch(...)`) fills an attribute position

```ts
html`<p>${text(label)}</p>`;
html`<button ${patch(on('click', handler))}>Go</button>`;
```

Templates are cached per call site, so repeated renders skip parsing. Using `patch(...)` in a content position throws `E12`. An interpolation count that does not match the number of slots throws `E11:<expected>:<got>`; a mismatch means the cached template for that call site was built from a different mix of interpolations. See [Errors](#errors).

#### `text`

```ts
const text: <T>(source: T | Sig<T>) => View<T, PatchContext>;
```

Creates a text-node view. With a `Sig`, the text updates whenever the signal changes; with a plain value it is static.

```ts
html`<span>${text(count)}</span>`;
```

#### `View<T, C>` / `AnyView`

```ts
interface View<T = unknown, C extends CmdContext = any> {
  type: 'view';
  node: Node;
  bind?: Bind<T, C> | undefined;
  cleanBinds: () => void;
  boundary: () => Boundary;
  children?: (AnyView | Patch)[];
}

type AnyView = View<any, any>;
```

`View` is the unit returned by `html`, `text`, `view`, and `repeat`. Its `node` is a DOM node or `DocumentFragment`. `boundary` returns the nodes the view currently occupies; `render` calls it at disposal time so a view that swaps its own contents (`view`, `repeat`) is torn down from its current nodes. `cleanBinds` detaches the view's bindings and, recursively, those of its `children`.

#### `replaceWithView`

```ts
const replaceWithView: (old: Boundary, view: View) => Boundary;
```

Helper used by `view` and `repeat` to swap a mounted view: replaces an existing boundary with the view's node and returns the new boundary.

### DOM bindings

#### `patch`

```ts
const patch: (...toPatchItems: ToAnyPatchItem[]) => Patch;
```

Declares one or more bindings to apply to the same element. Must be interpolated in an attribute position. Each command (`id`, `val`, `attr`, ...) receives either a plain value (applied once) or a `Sig` (applied on mount and re-applied on change).

```ts
html`<input ${patch(val(name), attr(placeholder, 'name'))} />`;
```

#### `id`

```ts
const id: <T>(source: T | Sig<T>) => ToPatchItem<T>;
```

Sets the element's `id`.

#### `val`

```ts
const val: <T>(source: T | Sig<T>) => ToPatchItem<T>;
```

Sets the element's `value` property (form controls).

#### `attr`

```ts
const attr: <T>(source: T | Sig<T>, key: string) => ToPatchItem<T>;
```

Sets attribute `key`. Use this for boolean/ARIA/data attributes.

#### `style`

```ts
const style: <T>(
  source: T | Sig<T>,
  key: WritableStyleKey,
) => ToPatchItem<T>;
```

Sets an inline style property by typed name.

```ts
html`<span ${patch(style(color, 'color'))}>text</span>`;
```

`WritableStyleKey` is the union of `CSSStyleDeclaration` keys whose values are strings.

#### `styleProperty`

```ts
const styleProperty: <T>(source: T | Sig<T>, key: string) => ToPatchItem<T>;
```

Sets a style property via `CSSStyleDeclaration.setProperty`. Use this for custom properties (`--my-var`) or untyped names.

```ts
html`<div ${patch(styleProperty(size, '--size'))}></div>`;
```

#### `toggleClass`

```ts
const toggleClass: <T>(source: T | Sig<T>, token: string) => ToPatchItem<T>;
```

Toggles a single class from the truthiness of the value.

#### `toggleClasses`

```ts
const toggleClasses: <T>(
  source: T | Sig<T>,
  ...tokens: string[]
) => ToPatchItem<T>;
```

Toggles several classes from one value.

#### `act`

```ts
type ActFn<T> = (node: Node, val?: T) => void;
const act: <T>(source: T | Sig<T>, fn: ActFn<T>) => ToPatchItem<T>;
```

Runs arbitrary code with the bound node and value; runs on mount and again on change. Use it as the escape hatch for anything the built-in commands do not cover.

```ts
html`<canvas ${patch(act(frame, (node, v) => draw(node, v)))}></canvas>`;
```

#### `on`

```ts
const on: <K extends keyof HTMLElementEventMap>(
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
  options?: boolean | AddEventListenerOptions,
) => ToPatchItem<
  (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown
>;
```

Adds a DOM event listener. The listener is registered once at mount; it is not a reactive source, so combine it with `sig` writes to drive updates.

```ts
html`<button ${patch(on('click', () => count.trans((v) => v + 1)))}>+1</button>`;
```

#### Patch types

```ts
interface PatchContext extends CmdContext {
  node: Node;
  extra?: unknown[];
}

interface PatchItem<T> {
  source: T | Sig<T>;
  context: PatchContext;
  cmd: Cmd<T, PatchContext>;
}

type ToPatchItem<T> = (el: Element) => PatchItem<T>;
type AnyPatchItem = PatchItem<any>;
type ToAnyPatchItem = (el: Element) => AnyPatchItem;

interface Patch {
  type: 'patch';
  toPatchItems: ToAnyPatchItem[];
  cleanBinds: () => void;
}
```

`ToPatchItem` defers reading the target element until mount. `patch` collects these factories into a single `Patch`; `cleanBinds` detaches the bindings created when the patch was committed to an element.

### Control flow

#### `view`

```ts
const view: <T>(
  sig: Sig<T>,
  viewFn: (val: T) => AnyView,
) => View<T>;
```

Conditionally renders one view or another. Whenever `sig` changes, `viewFn` is called with the new value, the previous view is torn down, and a new one is mounted in its place.

```ts
html`<div>${view(isEmpty, (v) => (v ? text('empty') : list))}</div>`;
```

#### `repeat`

```ts
type RepeatProp<T> = {
  key: (item: T) => string;
  view: (item: T) => AnyView;
  compare?: (a: T, b: T) => boolean;
};

const repeat: <T>(sig: Sig<T[]>, prop: RepeatProp<T>) => View<T[]>;
```

Keyed list rendering. On each change Sigula matches items by `key`, then reuses, moves, creates, or removes as few DOM nodes as possible. `compare` defaults to `isEqual`; when an item is deeply equal to the track it already occupies, the track is reused without rebuilding its view. An empty array renders `<!--empty-list-->`.

```ts
html`<ul>${repeat(todos, {
  key: (item) => item.id.toString(),
  view: (item) => html`<li>${text(item.label)}</li>`,
})}</ul>`;
```

`key` must be unique and stable for a given item. `compare` is useful when item identity is structural but you want to force or skip updates.

### Rendering

#### `render`

```ts
const render: (
  viewArg: AnyView | (() => AnyView),
  node: Node,
) => () => void;
```

Mounts a view into `node` by appending `view.node`. Accepts a `View` directly or a factory function that returns one. Returns a disposer that detaches every bind in the tree and removes the nodes from `node`, so a mounted tree can be torn down completely. Calling the disposer twice is a no-op.

```ts
const dispose = render(App(), document.querySelector('#app')!);
render(() => html`<p>lazy</p>`, document.body);
dispose();
```

A view that swaps its own contents — one built with `view()` or `repeat()` at the root — disposes the nodes currently in `node`, not the ones originally appended. An empty tagged template throws `E10`.

### Low-level API

These utilities power the framework and are exported for extension and testing.

#### `Boundary`

```ts
interface Boundary {
  start: Node;
  end: Node;
}
```

An inclusive range of sibling nodes (`start` through `end`).

#### `toBoundary`

```ts
const toBoundary: (node: Node) => Boundary;
```

Wraps a node in a `Boundary`. For a `DocumentFragment`, the boundary spans its first and last child; otherwise it covers the node itself. Throws `E2` on an empty fragment.

#### `walkBoundary`

```ts
const walkBoundary: (b: Boundary, fn: (node: Node) => void) => void;
```

Visits every node from `b.start` through `b.end`. Callers capture the next sibling before mutating; `removeBoundary` and `repeat`'s reordering are built on it.

#### `removeBoundary`

```ts
const removeBoundary: (b: Boundary) => void;
```

Removes every node in the boundary. A no-op if the boundary has no parent.

#### `replaceWithNode`

```ts
const replaceWithNode: (old: Boundary, node: Node) => Boundary;
```

Replaces an entire boundary with `node` and returns the new boundary. Throws `E3` if `old` has no parent. This is the primitive behind dynamic `view` and `repeat` swaps.

#### `Cmd` / `AnyCmd` / `CmdContext`

```ts
interface CmdContext {
  [key: string]: unknown;
}

type Cmd<T, C extends CmdContext> = (val: T, context: C) => void;
type AnyCmd = Cmd<any, any>;
```

A `Cmd` is the unit of work a binding runs: it receives the current signal value and its context.

### Errors

Runtime errors carry a short code in `message` instead of a sentence, so the
string tables stay out of the bundle. Codes with arguments are colon-separated.
Look yours up here:

| Code | Thrown by | Meaning |
| --- | --- | --- |
| `E1:<index>` | `at` | Array index out of range. |
| `E2` | `toBoundary` | Cannot build a boundary from an empty fragment. |
| `E3` | `replaceWithNode` | The old boundary has no `parentNode`. |
| `E4` | `patch` | A keyed command (`attr`, `style`, `styleProperty`, `toggleClass`) was given no key. |
| `E5` | `patch` | `act` was given no function. |
| `E6` | `patch` | `on` was given no event type. |
| `E7` | `repeat` | The rendered items have no parent node. |
| `E8` | `repeat` | The temporary start/end fences were removed mid-update. |
| `E9` | `repeat` | There is no node after the fence to move before. |
| `E10` | `html` | The template is empty (an empty tagged template). |
| `E11:<expected>:<got>` | `html` | Interpolation count does not match the template's slots. |
| `E12` | `html` | Unmatched interpolation; `patch()` must be in attribute position. |

### Reactivity model

- **Batched.** When a signal changes, its bindings are queued, not run synchronously.
- **Coalesced per binding.** A binding that is written to multiple times before the microtask flush runs once, reading the signal's final value. `sig.update(1); sig.update(2); sig.update(3)` runs each dependent binding a single time against `3`.
- **`update` vs `forceUpdate`.** `update` skips work when the new value is deeply equal to the current one; `forceUpdate` always notifies. Use `forceUpdate` when a value is structurally equal but you still need a re-render (for example, mutating an object in place).
- **Error isolation.** A throwing binding does not stop the rest of the queue; the error is logged as `console.error('[Queue] task failed:', error, bind)`.
- **Deep equality by default.** `update`, `compute`, and `repeat` compare with `isEqual`, so replacing `{a: 1}` with another `{a: 1}` is a no-op.

## License

MIT
