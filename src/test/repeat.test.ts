import {beforeEach, describe, expect, it} from 'vitest';
import {
  compute,
  html,
  render,
  repeat,
  type Sig,
  sig,
  text,
  type View,
  view,
} from '..';

function randomIntArray(length: number, min = 0, max = 100): number[] {
  const rangeSize = max - min + 1;
  if (length > rangeSize) throw new Error('range too small');
  const res = new Set<number>();
  while (res.size < length) {
    const num = Math.floor(Math.random() * rangeSize) + min;
    res.add(num);
  }
  return [...res];
}

describe('repeat', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('text', async () => {
    const nums = sig(Array.from({length: 10}, (_, i) => i + 1));
    render(
      repeat(nums, {
        key: (v) => v.toString(),
        view: (v) => text(`${v},`),
      }),
      document.body,
    );

    expect(document.body.innerHTML).toBe(
      nums
        .get()
        .map((v) => `${v},`)
        .join(''),
    );

    for (let i = 0; i < 10; i++) {
      const newNums0 = randomIntArray(150, 1, 1000);
      nums.forceUpdate(newNums0);
      await Promise.resolve();
      // await new Promise((resolve) => setTimeout(resolve, 100));
      expect(document.body.innerHTML).toBe(
        newNums0.map((v) => `${v},`).join(''),
      );

      const newNums1 = randomIntArray(300, 1, 1000);
      nums.forceUpdate(newNums1);
      await Promise.resolve();
      // await new Promise((resolve) => setTimeout(resolve, 100));
      expect(document.body.innerHTML).toBe(
        newNums1.map((v) => `${v},`).join(''),
      );

      const newNums2 = randomIntArray(200, 1, 1000);
      nums.forceUpdate(newNums2);
      await Promise.resolve();
      // await new Promise((resolve) => setTimeout(resolve, 100));
      expect(document.body.innerHTML).toBe(
        newNums2.map((v) => `${v},`).join(''),
      );
    }
  });

  it('with html', async () => {
    const nums = sig(Array.from({length: 10}, (_, i) => i + 1));
    render(
      repeat(nums, {
        key: (v) => v.toString(),
        view: (v) =>
          html`<span>${text(v * v)}</span> - <span>${text(v)}</span>`,
      }),
      document.body,
    );

    const expectedHtml = (items: number[]) =>
      items.map((v) => `<span>${v * v}</span> - <span>${v}</span>`).join('');

    expect(document.body.innerHTML).toBe(expectedHtml(nums.get()));

    for (let i = 0; i < 10; i++) {
      const newNums0 = randomIntArray(15, 1, 100);
      nums.forceUpdate(newNums0);
      await Promise.resolve();
      expect(document.body.innerHTML).toBe(expectedHtml(newNums0));

      const newNums1 = randomIntArray(30, 1, 100);
      nums.forceUpdate(newNums1);
      await Promise.resolve();
      expect(document.body.innerHTML).toBe(expectedHtml(newNums1));

      const newNums2 = randomIntArray(20, 1, 100);
      nums.forceUpdate(newNums2);
      await Promise.resolve();
      expect(document.body.innerHTML).toBe(expectedHtml(newNums2));
    }
  });

  it('with html and replaceWithNode', async () => {
    type Item = {id: number; val: string};
    const nums = sig(
      Array.from({length: 10}, (_, i) => ({id: i, val: i.toString()})),
    );
    render(
      repeat(nums, {
        key: (v) => v.id.toString(),
        view: (v) =>
          html`<span>${text(v.id)}</span> - <span>${text(v.val)}</span>`,
      }),
      document.body,
    );

    const expectedHtml = (items: Item[]) =>
      items.map((v) => `<span>${v.id}</span> - <span>${v.val}</span>`).join('');
    expect(document.body.innerHTML).toBe(expectedHtml(nums.get()));

    for (let i = 0; i < 10; i++) {
      const newNums0 = randomIntArray(15, 1, 100).map((v) => ({
        id: v,
        val: (v + 1).toString(),
      }));

      nums.forceUpdate(newNums0);
      await Promise.resolve();
      expect(document.body.innerHTML).toBe(expectedHtml(newNums0));

      const newNums1 = randomIntArray(15, 1, 100).map((v) => ({
        id: v,
        val: (v + 2).toString(),
      }));
      nums.forceUpdate(newNums1);
      await Promise.resolve();
      expect(document.body.innerHTML).toBe(expectedHtml(newNums1));
    }
  });

  it('view', async () => {
    const item0 = sig({id: 0, title: 'sigula', desc: 'web framework'});
    const item1 = sig({id: 1, title: 'vitest', desc: 'unit test'});
    const item2 = sig({id: 2, title: 'tsdown', desc: 'bundler'});

    const itemsSig = sig([item0, item1]);

    const expectedHtml = (
      args: Sig<{id: number; title: string; desc: string}>[],
    ) =>
      args
        .map((s) => {
          const v = s.get();
          return `<h2>${v.id}. ${v.title}</h2><div>${v.desc}</div>`;
        })
        .join('');

    render(
      repeat(itemsSig, {
        key: (item) => item.get().id.toString(),
        view: (item) =>
          view(
            item,
            (v) =>
              html`<h2>${text(`${v.id}. ${v.title}`)}</h2><div>${text(v.desc)}</div>`,
          ),
      }),
      document.body,
    );

    expect(document.body.innerHTML).toBe(expectedHtml([item0, item1]));

    itemsSig.update([item1, item0, item2]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item1, item0, item2]));

    item0.update({id: 0, title: 'sigula', desc: 'awesome web framework'});
    expect(item0.get().desc).toBe('awesome web framework');

    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item1, item0, item2]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(1);
    expect(item2.getBinds().length).toBe(1);

    itemsSig.update([item2, item0]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item2, item0]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(0);
    expect(item2.getBinds().length).toBe(1);
  });

  it('html + view + compute', async () => {
    const item0 = sig({id: 0, x: 0, y: 0});
    const item1 = sig({id: 1, x: 10, y: 10});
    const item2 = sig({id: 2, x: -1, y: -10});

    const itemsSig = sig([item0, item1]);

    const toPos = (v: {id: number; x: number; y: number}): string => {
      if (v.x === 0 && v.y === 0) return 'zero';
      else if (v.x > 0 && v.y > 0) return 'up-right';
      else if (v.x > 0 && v.y < 0) return 'bottom-right';
      else if (v.x < 0 && v.y > 0) return 'up-left';
      else if (v.x < 0 && v.y < 0) return 'bottom-left';
      return 'on-line';
    };

    const expectedHtml = (
      args: Sig<{id: number; x: number; y: number}>[],
    ): string =>
      args.map((item) => `<span>${toPos(item.get())}</span>`).join('');

    const itemView = (item: Sig<{id: number; x: number; y: number}>): View => {
      const pos = compute(item, toPos);
      return html`<span>${view(pos, (v) => text(v))}</span>`;
    };

    render(
      repeat(itemsSig, {
        key: (item) => item.get().id.toString(),
        view: itemView,
      }),
      document.body,
    );

    expect(document.body.innerHTML).toBe(expectedHtml([item0, item1]));

    itemsSig.update([item1, item0, item2]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item1, item0, item2]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(1);
    expect(item2.getBinds().length).toBe(1);

    itemsSig.update([item2, item0]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item2, item0]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(0);
    expect(item2.getBinds().length).toBe(1);

    expect(toPos(item2.get())).toBe('bottom-left');
    item2.trans((v) => ({...v, x: -2, y: 10}));
    expect(toPos(item2.get())).toBe('up-left');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item2, item0]));
    item2.trans((v) => ({...v, x: -2, y: 100}));
    expect(toPos(item2.get())).toBe('up-left');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item2, item0]));

    itemsSig.forceUpdate([item0]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item0]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(0);
    expect(item2.getBinds().length).toBe(0);

    itemsSig.forceUpdate([]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<!--empty-list-->');
    expect(item0.getBinds().length).toBe(0);
    expect(item1.getBinds().length).toBe(0);
    expect(item2.getBinds().length).toBe(0);

    itemsSig.forceUpdate([item0, item1, item2]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(expectedHtml([item0, item1, item2]));
    expect(item0.getBinds().length).toBe(1);
    expect(item1.getBinds().length).toBe(1);
    expect(item2.getBinds().length).toBe(1);
  });

  describe('single-node item views', () => {
    interface Item {
      id: number;
      label: string;
    }

    const itemView = (item: Item) => html`<li>${text(item.label)}</li>`;

    const mount = () => {
      const todos = sig<Item[]>([
        {id: 1, label: 'a'},
        {id: 2, label: 'b'},
        {id: 3, label: 'c'},
      ]);
      render(
        html`<div><ul>${repeat(todos, {
          key: (item) => item.id.toString(),
          view: itemView,
        })}</ul><p>FOOTER</p></div>`,
        document.body,
      );
      return todos;
    };

    const expected = (labels: string[]) =>
      `<div><ul>${labels.map((l) => `<li>${l}</li>`).join('')}</ul><p>FOOTER</p></div>`;

    it('keeps sibling items and following content when one item changes', async () => {
      const todos = mount();
      expect(document.body.innerHTML).toBe(expected(['a', 'b', 'c']));

      todos.update([
        {id: 1, label: 'a'},
        {id: 2, label: 'B*'},
        {id: 3, label: 'c'},
      ]);
      await Promise.resolve();

      expect(document.body.innerHTML).toBe(expected(['a', 'B*', 'c']));
    });

    it('keeps sibling items and following content when items reorder', async () => {
      const todos = mount();

      todos.update([
        {id: 3, label: 'c'},
        {id: 1, label: 'a'},
        {id: 2, label: 'b'},
      ]);
      await Promise.resolve();

      expect(document.body.innerHTML).toBe(expected(['c', 'a', 'b']));
    });

    it('keeps following content when items are appended', async () => {
      const todos = mount();

      todos.update([
        {id: 1, label: 'a'},
        {id: 2, label: 'b'},
        {id: 3, label: 'c'},
        {id: 4, label: 'd'},
      ]);
      await Promise.resolve();

      expect(document.body.innerHTML).toBe(expected(['a', 'b', 'c', 'd']));
    });

    it('keeps following content when items are removed', async () => {
      const todos = mount();

      todos.update([
        {id: 1, label: 'a'},
        {id: 3, label: 'c'},
      ]);
      await Promise.resolve();

      expect(document.body.innerHTML).toBe(expected(['a', 'c']));
    });

    it('never leaks internal fences into the output', async () => {
      const todos = mount();

      todos.update([
        {id: 1, label: 'A*'},
        {id: 2, label: 'B*'},
        {id: 3, label: 'C*'},
      ]);
      await Promise.resolve();

      expect(document.body.innerHTML).not.toContain('repeat-start-fence');
      expect(document.body.innerHTML).not.toContain('repeat-end-fence');
    });
  });

  describe('redundant updates', () => {
    interface Item {
      id: number;
      label: string;
    }

    const items: Item[] = [
      {id: 1, label: 'a'},
      {id: 2, label: 'b'},
      {id: 3, label: 'c'},
      {id: 4, label: 'd'},
    ];

    // counts structural DOM writes so we can assert an unchanged re-render
    // never touches the DOM at all
    type MutMethod = 'insertBefore' | 'removeChild' | 'replaceChild';

    const trackMutations = (node: Node) => {
      const counts: Record<MutMethod, number> = {
        insertBefore: 0,
        removeChild: 0,
        replaceChild: 0,
      };
      const target = node as unknown as Record<string, unknown>;
      const originals = new Map<MutMethod, unknown>();
      for (const method of [
        'insertBefore',
        'removeChild',
        'replaceChild',
      ] as MutMethod[]) {
        const original = target[method] as (...args: unknown[]) => unknown;
        originals.set(method, original);
        target[method] = (...args: unknown[]) => {
          counts[method]++;
          return original.apply(node, args);
        };
      }
      return {
        counts,
        restore: () => {
          for (const [method, original] of originals) {
            target[method] = original;
          }
        },
      };
    };

    const mount = () => {
      const todos = sig<Item[]>(items.map((i) => ({...i})));
      render(
        html`<div><ul>${repeat(todos, {
          key: (item) => item.id.toString(),
          view: (item) => html`<li>${text(item.label)}</li>`,
        })}</ul></div>`,
        document.body,
      );
      return todos;
    };

    it('performs no DOM mutations when the re-render is unchanged', async () => {
      const todos = mount();
      const list = document.querySelector('ul') as HTMLElement;
      const spy = trackMutations(list);

      todos.forceUpdate(items.map((i) => ({...i})));
      await Promise.resolve();
      await Promise.resolve();

      spy.restore();
      expect(spy.counts).toEqual({
        insertBefore: 0,
        removeChild: 0,
        replaceChild: 0,
      });
      expect(document.body.innerHTML).toBe(
        '<div><ul><li>a</li><li>b</li><li>c</li><li>d</li></ul></div>',
      );
    });

    it('performs no DOM mutations when re-rendering an equal array twice', async () => {
      const todos = mount();

      todos.forceUpdate(items.map((i) => ({...i})));
      await Promise.resolve();
      await Promise.resolve();

      const list = document.querySelector('ul') as HTMLElement;
      const spy = trackMutations(list);
      todos.forceUpdate(items.map((i) => ({...i})));
      await Promise.resolve();
      await Promise.resolve();
      spy.restore();

      expect(spy.counts).toEqual({
        insertBefore: 0,
        removeChild: 0,
        replaceChild: 0,
      });
    });

    it('still updates a track that was reused as-is by an earlier reorder', async () => {
      // a rotation that cannot be resolved from the head/tail, so the keyed
      // map path runs and reuses tracks that were already placed
      const rotated: Item[] = [
        {...(items[1] as Item)},
        {...(items[3] as Item)},
        {...(items[0] as Item)},
        {...(items[2] as Item)},
      ];
      const signal = sig<Item[]>(items.map((i) => ({...i})));
      render(
        html`<div><ul>${repeat(signal, {
          key: (item) => item.id.toString(),
          view: (item) => html`<li>${text(item.label)}</li>`,
        })}</ul></div>`,
        document.body,
      );

      signal.forceUpdate(rotated);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector('ul')?.innerHTML).toBe(
        '<li>b</li><li>d</li><li>a</li><li>c</li>',
      );

      // a track reused above must not be treated as already-handled and
      // skipped when its item changes later
      signal.forceUpdate([
        {...(items[1] as Item)},
        {...(items[3] as Item)},
        {...(items[0] as Item)},
        {id: 3, label: 'C-CHANGED'},
      ]);
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('ul')?.innerHTML).toBe(
        '<li>b</li><li>d</li><li>a</li><li>C-CHANGED</li>',
      );
    });
  });
});
