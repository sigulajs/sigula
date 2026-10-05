import {beforeEach, describe, expect, it} from 'vitest';
import {frag, html, render, sig, text, view} from '..';

describe('frag', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('composes views in order', () => {
    render(
      frag(text('a'), html`<b>${text('b')}</b>`, text('c')),
      document.body,
    );
    expect(document.body.innerHTML).toBe('a<b>b</b>c');
  });

  it('flattens nested fragments', () => {
    render(frag(frag(text('a'), text('b')), text('c')), document.body);
    expect(document.body.innerHTML).toBe('abc');
  });

  it('works in an html content position and keeps siblings', () => {
    render(
      html`<div>${frag(text('a'), text('b'))}<span>KEPT</span></div>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<div>ab<span>KEPT</span></div>');
  });

  it('renders nothing when empty', () => {
    render(frag(), document.body);
    expect(document.body.innerHTML).toBe('');
  });

  it('updates reactive children', async () => {
    const s = sig('x');
    render(frag(text(s), text('-')), document.body);
    expect(document.body.innerHTML).toBe('x-');

    s.update('y');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('y-');
  });

  it('cleans child binds and nodes on dispose', () => {
    const s = sig('x');
    const dispose = render(frag(text(s), text('-')), document.body);
    expect(s.getBinds().length).toBe(1);

    dispose();
    expect(s.getBinds().length).toBe(0);
    expect(document.body.innerHTML).toBe('');
  });

  it('disposes nodes when an edge view swaps its node', async () => {
    const mode = sig(true);
    const dispose = render(
      frag(
        view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`)),
        text('2'),
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

  it('keeps following siblings at the html leading edge across an edge swap', async () => {
    const mode = sig(true);
    const dispose = render(
      html`${frag(
        view(mode, (v) => (v ? html`<i>1</i>` : html`<b>1</b>`)),
        text('x'),
      )}<span>KEPT</span>`,
      document.body,
    );
    expect(document.body.innerHTML).toBe('<i>1</i>x<span>KEPT</span>');

    mode.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>1</b>x<span>KEPT</span>');

    dispose();
    expect(document.body.innerHTML).toBe('');
  });

  it('cleans children when hidden inside a view', async () => {
    const show = sig(true);
    const s = sig('x');
    render(
      view(show, (v) => (v ? frag(text(s), text('-')) : text('off'))),
      document.body,
    );
    expect(s.getBinds().length).toBe(1);

    show.update(false);
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('off');
    expect(s.getBinds().length).toBe(0);
  });
});
