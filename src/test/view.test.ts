import {beforeEach, describe, expect, it} from 'vitest';
import {compute, html, render, repeat, sig, text, view} from '..';

describe('view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('basic', async () => {
    const source = sig(false);
    render(
      view(source, (v) => html`<div>${text(v)}</div>`),
      document.body,
    );

    expect(document.body.innerHTML).toBe('<div>false</div>');
    source.trans((v) => !v);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>true</div>');
  });

  it('with compute and repeat', async () => {
    const source = sig<number[]>([]);
    const isEmpty = compute(source, (v) => v.length <= 0);

    expect(source.getBinds().length).toBe(1);
    expect(isEmpty.getBinds().length).toBe(0);

    render(
      view(isEmpty, (p) =>
        p
          ? html`<div>Empty</div>`
          : html`<div>${repeat(source, {
              key: (item) => item.toString(),
              view: (item) => html`<span>${text(item)}</span>`,
            })}</div>`,
      ),
      document.body,
    );
    expect(source.getBinds().length).toBe(1);
    expect(isEmpty.getBinds().length).toBe(1);

    expect(document.body.innerHTML).toBe('<div>Empty</div>');

    source.update([1, 2]);
    await Promise.resolve();
    expect(source.getBinds().length).toBe(2);
    expect(isEmpty.getBinds().length).toBe(1);
    expect(document.body.innerHTML).toBe(
      '<div><span>1</span><span>2</span></div>',
    );

    const bs = source.getBinds();
    const b0 = bs[0];
    const b1 = bs[1];
    expect(b0?.removed).toBe(false);
    expect(b1?.removed).toBe(false);

    source.update([]);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>Empty</div>');
    expect(source.getBinds().length).toBe(1);
    expect(isEmpty.getBinds().length).toBe(1);
    expect(b0?.removed).toBe(false);
    expect(b1?.removed).toBe(true);
  });

  it('keeps following siblings when swapping a single-node view', async () => {
    const isDark = sig(false);
    render(
      html`<main>${view(isDark, (v) =>
        v ? html`<div class="dark"></div>` : html`<div class="light"></div>`,
      )}<footer>KEPT</footer><aside>ALSO KEPT</aside></main>`,
      document.body,
    );

    expect(document.body.innerHTML).toBe(
      '<main><div class="light"></div><footer>KEPT</footer><aside>ALSO KEPT</aside></main>',
    );

    isDark.update(true);
    await Promise.resolve();

    expect(document.body.innerHTML).toBe(
      '<main><div class="dark"></div><footer>KEPT</footer><aside>ALSO KEPT</aside></main>',
    );
  });

  it('keeps following siblings when swapping a single text-node view', async () => {
    const mode = sig('a');
    render(
      html`<p>${view(mode, (v) => text(v.toUpperCase()))}<b>TAIL</b></p>`,
      document.body,
    );

    expect(document.body.innerHTML).toBe('<p>A<b>TAIL</b></p>');

    mode.update('b');
    await Promise.resolve();

    expect(document.body.innerHTML).toBe('<p>B<b>TAIL</b></p>');
  });

  it('keeps a computed value live across a hide and re-show', async () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);
    const show = sig(true);

    render(
      html`<p>${view(show, (v) => (v ? text(doubled) : text('off')))}</p>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<p>2</p>');

    show.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<p>off</p>');

    source.update(9);
    await Promise.resolve();

    show.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<p>18</p>');
  });

  it('keeps propagating after a computed value is re-shown', async () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);
    const show = sig(true);

    render(
      html`<p>${view(show, (v) => (v ? text(doubled) : text('off')))}</p>`,
      document.body,
    );

    show.update(false);
    await Promise.resolve();
    show.update(true);
    await Promise.resolve();

    source.update(10);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<p>20</p>');
  });
});

it('disposes a view tree containing nested views', () => {
  const outer = sig(true);
  const inner = sig(1);
  const el = document.createElement('div');

  const dispose = render(
    html`<div>${view(outer, (v) =>
      v ? html`<span>${text(inner)}</span>` : html`<span>off</span>`,
    )}</div>`,
    el,
  );
  expect(inner.getBinds().length).toBe(1);

  dispose();
  expect(inner.getBinds().length).toBe(0);
  expect(outer.getBinds().length).toBe(0);
});
