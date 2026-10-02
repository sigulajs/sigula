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
});
