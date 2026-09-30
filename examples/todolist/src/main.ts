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

const TodoList = (): View => {
  const input = sig('init');
  const todos = sig<Todo[]>([]);
  const hasItems = compute(todos, (v) => v.length > 0);

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

  return html`<div style="margin: 2rem auto; max-width: 400px">
    <h1>Todo List</h1>
    <form ${patch(on('submit', addTodo))}>
      <input ${patch(
        val(input),
        on('change', (e) => {
          if (e.target) input.update((e.target as HTMLInputElement).value);
        }),
      )} />
      <button>Add</button>
    </form>
    ${view(hasItems, (v) =>
      v
        ? html`<ul>${repeat(todos, {
            key: (item) => item.id.toString(),
            view: (item) => itemView(item),
          })}</ul>`
        : text('empty'),
    )}
  </div>`;
};

const appNode = document.querySelector('#app');
if (!appNode) throw new Error('#app not found');
render(TodoList(), appNode);
