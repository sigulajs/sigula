import {beforeEach, describe, expect, it} from 'vitest';
import {
  attr,
  compute,
  html,
  patch,
  ref,
  render,
  repeat,
  sig,
  text,
  view,
} from '..';

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

  it('puts a shared fragment view back when it is shown again', async () => {
    const shared = html`<b>shared</b>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('other')))}</div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<div><b>shared</b></div>');

    flag.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>other</div>');

    flag.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div><b>shared</b></div>');
  });

  it('puts a shared single-node view back when it is shown again', async () => {
    const shared = text('shared');
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('other')))}</div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<div>shared</div>');

    flag.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>other</div>');

    flag.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>shared</div>');
  });

  it('keeps a shared html view reactive after it is put back', async () => {
    const counter = sig(1);
    const shared = html`<b>${text(counter)}</b>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('off')))}</div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<div><b>1</b></div>');

    flag.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>off</div>');
    expect(counter.getBinds().length).toBe(0);

    flag.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div><b>1</b></div>');
    expect(counter.getBinds().length).toBe(1);

    counter.update(2);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div><b>2</b></div>');
  });

  it('catches a shared view up to changes made while it was hidden', async () => {
    const counter = sig(1);
    const shared = html`<b>${text(counter)}</b>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('off')))}</div>`,
      document.body,
    );

    flag.update(false);
    await Promise.resolve();
    counter.update(7);
    await Promise.resolve();

    flag.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div><b>7</b></div>');
  });

  it('keeps a shared view with patch bindings reactive after put-back', async () => {
    const title = sig('a');
    const shared = html`<span ${patch(attr('data-x', title))}>x</span>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('off')))}</div>`,
      document.body,
    );
    expect(document.querySelector('span')?.getAttribute('data-x')).toBe('a');

    flag.update(false);
    await Promise.resolve();
    title.update('b');
    await Promise.resolve();

    flag.update(true);
    await Promise.resolve();
    expect(document.querySelector('span')?.getAttribute('data-x')).toBe('b');

    title.update('c');
    await Promise.resolve();
    expect(document.querySelector('span')?.getAttribute('data-x')).toBe('c');
  });

  it('keeps a shared repeat view reactive after put-back', async () => {
    const items = sig([1, 2]);
    const tag = sig('a');
    const shared = html`<ul>${repeat(items, {
      key: (n) => String(n),
      view: (n) => html`<li>${text(tag)}${text(n)}</li>`,
    })}</ul>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('off')))}</div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe(
      '<div><ul><li>a1</li><li>a2</li></ul></div>',
    );
    expect(tag.getBinds().length).toBe(2);

    flag.update(false);
    await Promise.resolve();
    expect(tag.getBinds().length).toBe(0);

    flag.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(
      '<div><ul><li>a1</li><li>a2</li></ul></div>',
    );
    expect(tag.getBinds().length).toBe(2);

    tag.update('b');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe(
      '<div><ul><li>b1</li><li>b2</li></ul></div>',
    );
  });

  it('reconciles a hidden nested control-flow view on put-back', async () => {
    const inner = sig(1);
    const wrapper = view(sig(true), (s) => (s ? text(inner) : text('x')));
    const showWrapper = sig(true);

    render(
      html`<div>${view(showWrapper, (v) => (v ? wrapper : text('off')))}</div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<div>1</div>');

    showWrapper.update(false);
    await Promise.resolve();
    inner.update(2);
    await Promise.resolve();

    showWrapper.update(true);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>2</div>');

    inner.update(3);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div>3</div>');
  });

  it('resets a shared view ref when it is swapped out', async () => {
    const target = sig<Element | null>(null);
    const shared = html`<span ${patch(ref(target))}></span>`;
    const flag = sig(true);

    render(
      html`<div>${view(flag, (v) => (v ? shared : text('off')))}</div>`,
      document.body,
    );
    expect(target.get()?.tagName).toBe('SPAN');

    flag.update(false);
    await Promise.resolve();
    expect(target.get()).toBeNull();
  });

  it('keeps the content when viewFn returns the mounted view again', async () => {
    const shared = html`<b>shared</b>`;
    const flag = sig(true);

    render(html`<div>${view(flag, () => shared)}</div>`, document.body);
    expect(document.body.innerHTML).toBe('<div><b>shared</b></div>');

    flag.notify();
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<div><b>shared</b></div>');
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
