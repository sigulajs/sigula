import {beforeEach, describe, expect, it} from 'vitest';
import {html, raw, render, sig} from '..';

describe('raw', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts parsed HTML without a wrapper', () => {
    render(raw('<b>hi</b>'), document.body);
    expect(document.body.innerHTML).toBe('<b>hi</b>');
  });

  it('mounts multiple root nodes in order', () => {
    render(raw('a<b>b</b>c'), document.body);
    expect(document.body.innerHTML).toBe('a<b>b</b>c');
  });

  it('works in an html content position and keeps siblings', () => {
    render(html`<div>${raw('<i>x</i>')}<span>KEPT</span></div>`, document.body);
    expect(document.body.innerHTML).toBe(
      '<div><i>x</i><span>KEPT</span></div>',
    );
  });

  it('replaces content reactively across node counts', async () => {
    const s = sig('<b>a</b>');
    render(raw(s), document.body);
    expect(document.body.innerHTML).toBe('<b>a</b>');

    s.update('');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('');

    s.update('<i>c</i>tail');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<i>c</i>tail');

    s.update('');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('');
  });

  it('renders nothing for an empty string and later mounts content', async () => {
    const s = sig('');
    render(raw(s), document.body);
    expect(document.body.innerHTML).toBe('');

    s.update('<b>x</b>');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<b>x</b>');
  });

  it('cleans the bind and nodes on dispose', () => {
    const s = sig('<b>a</b>');
    const dispose = render(raw(s), document.body);
    expect(s.getBinds().length).toBe(1);
    expect(document.body.innerHTML).toBe('<b>a</b>');

    dispose();
    expect(s.getBinds().length).toBe(0);
    expect(document.body.innerHTML).toBe('');
  });
});
