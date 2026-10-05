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

  // Derived State
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
          on('click', () => {
            item.done.trans((v) => !v);
            todos.notify();
          }),
          style(
            'textDecoration',
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
          ),
        )}
      >${item.text}</span>
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
