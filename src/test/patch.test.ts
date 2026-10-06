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
  styleProp,
  toPatchItem,
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
    render(html`<div ${patch(attr('data-color', s))}></div>`, document.body);
    const div = document.querySelector('div') as Element;
    expect(div.getAttribute('data-color')).toBe('red');
    s.forceUpdate('blue');
    await flush();
    expect(div.getAttribute('data-color')).toBe('blue');
  });

  it('style', async () => {
    const s = sig('red');
    render(html`<div ${patch(style('color', s))}></div>`, document.body);
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.color).toBe('red');
    s.forceUpdate('blue');
    await flush();
    expect(div.style.color).toBe('blue');
  });

  it('styleProp', async () => {
    const s = sig('10px');
    render(html`<div ${patch(styleProp('--size', s))}></div>`, document.body);
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.getPropertyValue('--size')).toBe('10px');
    s.forceUpdate('20px');
    await flush();
    expect(div.style.getPropertyValue('--size')).toBe('20px');
  });

  it('toggleClass', async () => {
    const s = sig(true);
    render(html`<div ${patch(toggleClass('on', s))}></div>`, document.body);
    const div = document.querySelector('div') as Element;
    expect(div.classList.contains('on')).toBe(true);
    s.forceUpdate(false);
    await flush();
    expect(div.classList.contains('on')).toBe(false);
  });

  it('toggleClasses', async () => {
    const s = sig(true);
    render(
      html`<div ${patch(toggleClasses(['a', 'b'], s))}></div>`,
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

  it('toPatchItem builds a deferred patch item', () => {
    const node = document.createElement('div');
    const cmd = vi.fn();
    const withExtra = toPatchItem('x', ['k'], cmd)(node);
    expect(withExtra.source).toBe('x');
    expect(withExtra.context).toEqual({node, extra: ['k']});
    expect(withExtra.cmd).toBe(cmd);

    const withoutExtra = toPatchItem('y', undefined, cmd)(node);
    expect(withoutExtra.context).toEqual({node});
  });

  it('throws when the key is missing', () => {
    const node = document.createElement('div');
    const item = attr('k', 'x')(node);
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
      html`<div ${patch(id(s), attr('data-x', s))}></div>`;

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

  it('props: static id, val and attr', () => {
    render(
      html`<input ${patch({id: 'test', val: 'one', placeholder: 'name'})} />`,
      document.body,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('test');
    expect(input.value).toBe('one');
    expect(input.getAttribute('placeholder')).toBe('name');
  });

  it('props: reactive id, val and attr update', async () => {
    const sid = sig('a');
    const sval = sig('one');
    const sattr = sig('red');
    render(
      html`<input ${patch({id: sid, val: sval, 'data-color': sattr})} />`,
      document.body,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('a');
    expect(input.value).toBe('one');
    expect(input.getAttribute('data-color')).toBe('red');
    sid.forceUpdate('b');
    sval.forceUpdate('two');
    sattr.forceUpdate('blue');
    await flush();
    expect(input.id).toBe('b');
    expect(input.value).toBe('two');
    expect(input.getAttribute('data-color')).toBe('blue');
  });

  it('props: class map toggles and updates', async () => {
    const active = sig(true);
    const hidden = sig(false);
    render(
      html`<div ${patch({class: {active, hidden}})}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as Element;
    expect(div.classList.contains('active')).toBe(true);
    expect(div.classList.contains('hidden')).toBe(false);
    active.forceUpdate(false);
    hidden.forceUpdate(true);
    await flush();
    expect(div.classList.contains('active')).toBe(false);
    expect(div.classList.contains('hidden')).toBe(true);
  });

  it('props: reactive style and styleProp', async () => {
    const color = sig('red');
    const size = sig('10px');
    render(
      html`<div ${patch({style: {color}, styleProp: {'--size': size}})}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.color).toBe('red');
    expect(div.style.getPropertyValue('--size')).toBe('10px');
    color.forceUpdate('blue');
    size.forceUpdate('20px');
    await flush();
    expect(div.style.color).toBe('blue');
    expect(div.style.getPropertyValue('--size')).toBe('20px');
  });

  it('props: on registers a listener', () => {
    const handler = vi.fn();
    render(
      html`<button ${patch({on: {click: handler}})}>go</button>`,
      document.body,
    );
    document.querySelector('button')?.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('props: composes with patch items', () => {
    const s = sig('x');
    render(
      html`<div ${patch({id: 'a'}, attr('data-x', s))}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as Element;
    expect(div.id).toBe('a');
    expect(div.getAttribute('data-x')).toBe('x');
  });

  it('props: empty object is a no-op', () => {
    render(html`<div ${patch({})}>x</div>`, document.body);
    expect(document.querySelector('div')?.innerHTML).toBe('x');
  });

  it('props: skips undefined values', () => {
    const maybe: string | undefined = undefined;
    render(
      html`<input ${patch({id: maybe, 'data-x': maybe})} />`,
      document.body,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('');
    expect(input.hasAttribute('data-x')).toBe(false);
  });

  it('props: skips undefined nested entries', () => {
    const maybe: boolean | undefined = undefined;
    render(html`<div ${patch({class: {on: maybe}})}></div>`, document.body);
    expect(document.querySelector('div')?.classList.contains('on')).toBe(false);
  });

  it('props: coerces arbitrary attributes to strings', () => {
    render(html`<input ${patch({disabled: false})} />`, document.body);
    expect(document.querySelector('input')?.getAttribute('disabled')).toBe(
      'false',
    );
  });

  it('props: zero-argument patch is a no-op', () => {
    expect(patch().toPatchItems).toEqual([]);
  });

  it('props: props are applied before items', () => {
    render(html`<div ${patch({id: 'a'}, id('b'))}></div>`, document.body);
    expect(document.querySelector('div')?.id).toBe('b');
  });
});
