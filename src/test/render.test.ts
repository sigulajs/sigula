import {beforeEach, describe, expect, it} from 'vitest';
import {html, on, patch, render, sig, text, view} from '..';

const host = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

describe('render disposer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detaches every bind and empties the container', () => {
    const source = sig(1);
    const el = host();

    const dispose = render(html`<p>${text(source)}</p>`, el);
    expect(source.getBinds().length).toBe(1);
    expect(el.innerHTML).toBe('<p>1</p>');

    dispose();

    expect(source.getBinds().length).toBe(0);
    expect(el.innerHTML).toBe('');
  });

  it('is safe to call twice', () => {
    const source = sig(1);
    const el = host();

    const dispose = render(html`<p>${text(source)}</p>`, el);
    dispose();
    expect(() => dispose()).not.toThrow();
    expect(source.getBinds().length).toBe(0);
  });

  it('renders and disposes an empty template with throwing', () => {
    const el = host();

    expect(() => render(html``, el)).toThrow('html: empty');
  });

  it('works with the thunk form', () => {
    const source = sig(1);
    const el = host();

    const dispose = render(() => html`<p>${text(source)}</p>`, el);
    expect(el.innerHTML).toBe('<p>1</p>');

    dispose();
    expect(source.getBinds().length).toBe(0);
  });

  it('removes the nodes a root view swapped in, not the originals', async () => {
    const flip = sig(false);
    const el = host();

    const dispose = render(
      view(flip, (v) => (v ? html`<b>dark</b>` : html`<b>light</b>`)),
      el,
    );
    expect(el.innerHTML).toBe('<b>light</b>');

    flip.update(true);
    await Promise.resolve();
    expect(el.innerHTML).toBe('<b>dark</b>');

    dispose();
    expect(el.innerHTML).toBe('');
    expect(flip.getBinds().length).toBe(0);
  });

  it('disposes a tree containing patch bindings', () => {
    const source = sig(1);
    const el = host();
    let clicks = 0;

    const dispose = render(
      html`<button ${patch(
        on('click', () => {
          clicks++;
        }),
      )}>${text(source)}</button>`,
      el,
    );
    expect(source.getBinds().length).toBe(1);

    (el.querySelector('button') as HTMLButtonElement).click();
    expect(clicks).toBe(1);

    dispose();
    expect(source.getBinds().length).toBe(0);
    expect(el.innerHTML).toBe('');
  });
});
