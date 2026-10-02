# Sigula

> Tiny web framework with fine-grained signal reactivity.

A minimal, signal-based web framework with fine-grained reactivity. No virtual DOM — just direct, minimal updates to the real DOM.

## ✨ Features

- Fine-grained signal reactivity — when state changes, only the DOM nodes that actually depend on it are updated, not the whole component tree
- Declarative signal sources + precise bindings — describe data sources declaratively with signals, then bind them precisely to the DOM or any effect
- No virtual DOM — no diffing, no VNodes. Direct real DOM operations with minimal runtime overhead
- Minimal HTML templates — based on native string templates. No custom compiler, no DSL — just JavaScript strings
- Ultra small — only ~3.89KB minified + gzipped
- TypeScript friendly — full type inference for signals and template bindings
- Simple but performant — tiny API surface, low mental overhead, no compromise on performance

## Installation

```sh
npm install sigual
pnpm add sigual
yarn add sigual
```

## Quck Start

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
import {html text} from 'sigula';

const name = sig('Alice')

const App = html`<h1>Hello, ${text(name)}!</h1>`

// When name changes, only the text node inside <h1> is updated
name.update('Bob') // → the text changes from "Hello, Alice!" to "Hello, Bob!"
```

Only the exact text node that depends on name is updated. Everything else stays untouched.

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

Templates are plain JavaScript native string templates. No custom compiler, no .vue files, no JSX transform:

```ts
const App: View = html`
  <div class="card">
    <h2>${text(title)}</h2>
    <p>${text(description)}</p>
    <button ${patch(on('click', handleClick))}>Click me</button>
  </div>
`
```

html is a tagged template function that returns a mountable template (`View`) object. You can use any editor's syntax highlighting, formatting, and ESLint rules — no extra tooling required.

### Ultra small

minified + gzipped: ~3.89KB


