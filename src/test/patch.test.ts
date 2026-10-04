import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  attr,
  html,
  id,
  on,
  patch,
  render,
  type Sig,
  sig,
  style,
  styleProperty,
  toggleClass,
  toggleClasses,
  val,
} from '..';

// binds are dispatched from a microtask queue
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('patch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('id', () => {
    render(html`<div ${patch(id('test'))}>test</div>`, document.body);
    expect(document.getElementById('test')?.innerHTML).toBe('test');
  });

  it('id updates', async () => {
    const s = sig('a');
    render(html`<div ${patch(id(s))}>x</div>`, document.body);
    expect(document.querySelector('div')?.id).toBe('a');
    s.forceUpdate('b');
    await flush();
    expect(document.querySelector('div')?.id).toBe('b');
  });

  it('val', async () => {
    const s = sig('one');
    render(html`<input ${patch(val(s))} />`, document.body);
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('one');
    s.forceUpdate('two');
    await flush();
    expect(input.value).toBe('two');
  });

  it('attr', async () => {
    const s = sig('red');
    render(html`<div ${patch(attr(s, 'data-color'))}></div>`, document.body);
    const div = document.querySelector('div') as Element;
    expect(div.getAttribute('data-color')).toBe('red');
    s.forceUpdate('blue');
    await flush();
    expect(div.getAttribute('data-color')).toBe('blue');
  });

  it('style', async () => {
    const s = sig('red');
    render(html`<div ${patch(style(s, 'color'))}></div>`, document.body);
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.color).toBe('red');
    s.forceUpdate('blue');
    await flush();
    expect(div.style.color).toBe('blue');
  });

  it('styleProperty', async () => {
    const s = sig('10px');
    render(
      html`<div ${patch(styleProperty(s, '--size'))}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.getPropertyValue('--size')).toBe('10px');
    s.forceUpdate('20px');
    await flush();
    expect(div.style.getPropertyValue('--size')).toBe('20px');
  });

  it('toggleClass', async () => {
    const s = sig(true);
    render(html`<div ${patch(toggleClass(s, 'on'))}></div>`, document.body);
    const div = document.querySelector('div') as Element;
    expect(div.classList.contains('on')).toBe(true);
    s.forceUpdate(false);
    await flush();
    expect(div.classList.contains('on')).toBe(false);
  });

  it('toggleClasses', async () => {
    const s = sig(true);
    render(
      html`<div ${patch(toggleClasses(s, 'a', 'b'))}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as Element;
    expect(div.classList.contains('a')).toBe(true);
    expect(div.classList.contains('b')).toBe(true);
    s.forceUpdate(false);
    await flush();
    expect(div.classList.contains('a')).toBe(false);
    expect(div.classList.contains('b')).toBe(false);
  });

  it('act', async () => {
    const s = sig(1);
    const seen: unknown[] = [];
    const fn = vi.fn((node: Node, v?: number) => {
      seen.push([(node as Element).tagName, v]);
    });
    render(html`<span ${patch(act(s, fn))}></span>`, document.body);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([['SPAN', 1]]);
    s.forceUpdate(2);
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([
      ['SPAN', 1],
      ['SPAN', 2],
    ]);
  });

  it('on', () => {
    const handler = vi.fn();
    render(
      html`<button ${patch(on('click', handler))}>go</button>`,
      document.body,
    );
    document.querySelector('button')?.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on forwards the event', () => {
    const handler = vi.fn();
    render(
      html`<button ${patch(on('click', handler))}>go</button>`,
      document.body,
    );
    const ev = new Event('click');
    document.querySelector('button')?.dispatchEvent(ev);
    expect(handler.mock.calls[0]?.[0]).toBe(ev);
  });

  it('throws when the key is missing', () => {
    const node = document.createElement('div');
    const item = attr('x', 'k')(node);
    expect(() => item.cmd('x', {node, extra: []})).toThrow('E4');
  });

  it('throws a coded error for a malformed command', () => {
    const node = document.createElement('div');
    expect(() => act('x', () => {})(node).cmd('x', {node, extra: []})).toThrow(
      'E5',
    );
    expect(() =>
      on('click', () => {})(node).cmd(() => {}, {node, extra: []}),
    ).toThrow('E6');
  });

  it('throws when a patch is used in child position', () => {
    const s = sig('a');
    // the marker for a patch is an attribute token, so in child position it
    // renders as text and the command would silently never be bound
    expect(() => html`<div>${patch(id(s))}</div>`).toThrow('E12');
  });

  it('binds correctly on a second render of the same template', async () => {
    // calling the same template literal site twice hits the template cache,
    // which locates slots by index instead of by marker
    const make = (s: Sig<string>) =>
      html`<div ${patch(id(s), attr(s, 'data-x'))}></div>`;

    const first = sig('one');
    render(make(first), document.body);
    const firstEl = document.querySelector('div') as Element;
    expect(firstEl.id).toBe('one');
    expect(firstEl.getAttribute('data-x')).toBe('one');

    const second = sig('two');
    const host = document.createElement('section');
    document.body.appendChild(host);
    render(make(second), host);
    const secondEl = host.querySelector('div') as Element;
    expect(secondEl.id).toBe('two');
    expect(secondEl.getAttribute('data-x')).toBe('two');

    // and both stay live
    first.forceUpdate('ONE');
    second.forceUpdate('TWO');
    await flush();
    expect(firstEl.id).toBe('ONE');
    expect(firstEl.getAttribute('data-x')).toBe('ONE');
    expect(secondEl.id).toBe('TWO');
    expect(secondEl.getAttribute('data-x')).toBe('TWO');
  });
});
