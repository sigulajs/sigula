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
            'textDecoration',
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
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

The full API reference is generated from the TSDoc comments in the source: see [Reference.md](./Reference.md).

## Errors

Runtime errors carry a short code in `message` instead of a sentence, so the
string tables stay out of the bundle. Codes with arguments are colon-separated.
Look yours up here:

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
| `E12` | `html` | Unmatched interpolation; a `Patch` must be in an attribute position and a `View`/text value in a content position. |

## Reactivity model

- **Batched.** When a signal changes, its bindings are queued, not run synchronously.
- **Coalesced per binding.** A binding that is written to multiple times before the microtask flush runs once, reading the signal's final value. `sig.update(1); sig.update(2); sig.update(3)` runs each dependent binding a single time against `3`.
- **`update` vs `forceUpdate`.** `update` skips work when the new value is deeply equal to the current one; `forceUpdate` always notifies. Use `forceUpdate` when a value is structurally equal but you still need a re-render (for example, mutating an object in place).
- **`notify` for in-place mutation.** `sig.notify()` re-runs dependents against the current value without setting a new one. Use it after mutating a held object or array in place; `update`/`forceUpdate` set a value. On a `DerivedSig`, `notify` schedules its consumers but does not itself recompute the derived value.
- **Error isolation.** A throwing binding does not stop the rest of the queue; the error is logged as `console.error('[Queue] task failed:', error, bind)`.
- **Deep equality by default.** `update`, `compute`, and `repeat` compare with `eq`, so replacing `{a: 1}` with another `{a: 1}` is a no-op.

## License

MIT
