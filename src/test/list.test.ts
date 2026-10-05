import {beforeEach, describe, expect, it, vi} from 'vitest';
import {html, list, render, sig, text, view} from '..';

describe('list', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders items in order and passes the index', () => {
    render(
      list(['a', 'b', 'c'], (item, index) => text(`${item}${index}`)),
      document.body,
    );
    expect(document.body.innerHTML).toBe('a0b1c2');
  });

  it('updates reactive content inside an item', async () => {
    const count = sig(0);
    render(
      list(['a', 'b'], (item) => html`<span>${item}${text(count)}</span>`),
      document.body,
    );
    expect(document.body.innerHTML).toBe('<span>a0</span><span>b0</span>');

    count.update(1);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<span>a1</span><span>b1</span>');
  });

  it('renders an empty-list comment without calling viewFn', () => {
    const fn = vi.fn(() => text('x'));
    render(list([], fn), document.body);
    expect(document.body.innerHTML).toBe('<!--empty-list-->');
    expect(fn).not.toHaveBeenCalled();
  });

  it('cleans nested binds on dispose', () => {
    const s = sig('x');
    const dispose = render(
      list([1, 2], () => text(s)),
      document.body,
    );
    expect(s.getBinds().length).toBe(2);

    dispose();
    expect(s.getBinds().length).toBe(0);
  });

  it('keeps following siblings when used in html', () => {
    render(
      html`<main>${list([1, 2], (n) => text(String(n)))}<footer>KEPT</footer></main>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe(
      '<main>12<footer>KEPT</footer></main>',
    );
  });

  it('accepts a readonly array', () => {
    const items: readonly number[] = [1, 2];
    render(
      list(items, (n) => text(String(n))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('12');
  });

  it('supports a reactive view inside an item', async () => {
    const mode = sig('a');
    render(
      list([1, 2], (n) => view(mode, (v) => text(`${n}:${v}`))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('1:a2:a');

    mode.update('b');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('1:b2:b');
  });

  it('disposes nodes when an edge item swaps its node', async () => {
    const mode = sig(true);
    const dispose = render(
      list([1, 2], (n) =>
        n === 1
          ? view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`))
          : text('2'),
      ),
      document.body,
    );
    expect(document.body.innerHTML).toBe('<i>1</i>2');

    mode.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>1</b>2');

    dispose();
    expect(document.body.innerHTML).toBe('');
  });

  it('disposes correctly when a list edge item swaps inside html', async () => {
    const mode = sig(true);
    const dispose = render(
      html`${list([1], () =>
        view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`)),
      )}<footer>KEPT</footer>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<i>1</i><footer>KEPT</footer>');

    mode.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>1</b><footer>KEPT</footer>');

    dispose();
    expect(document.body.innerHTML).toBe('');
  });

  it('nests lists', () => {
    render(
      list([1, 2], (n) => list([n, n], (m) => text(String(m)))),
      document.body,
    );
    expect(document.body.innerHTML).toBe('1122');
  });
});
