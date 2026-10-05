import {beforeEach, describe, expect, it} from 'vitest';
import {attr, html, patch, render, sig, text, toggleClass, view} from '..';

describe('html', () => {
  const capture = (s: TemplateStringsArray, ..._: unknown[]) => s;
  const drive = html as unknown as (
    s: TemplateStringsArray,
    ...items: unknown[]
  ) => unknown;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports the position guard when a slot changes kind between renders of one call site', () => {
    const cell = (live: boolean) =>
      html`<td>${live ? patch(toggleClass('hot', sig('on'))) : text('-')}</td>`;

    render(cell(false), document.body);
    expect(document.body.innerHTML).toBe('<td>-</td>');

    expect(() => render(cell(true), document.body)).toThrow('E12');
  });

  it('renders a call site whose slots keep the same kind', async () => {
    const mode = sig('a');
    const cell = (dynamic: boolean) =>
      html`<td>${dynamic ? view(mode, (v) => text(v)) : text('-')}</td>`;

    render(cell(false), document.body);
    expect(document.body.innerHTML).toBe('<td>-</td>');

    document.body.innerHTML = '';
    render(cell(true), document.body);
    expect(document.body.innerHTML).toBe('<td>a</td>');

    mode.update('b');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<td>b</td>');
  });

  it('rejects too few interpolations for the template', () => {
    const strs = capture`<p>${text('x')}</p>`;
    document.body.innerHTML = '<i>seed</i>';
    expect(() => render(drive(strs) as never, document.body)).toThrow(
      'E11:1:0',
    );
    expect(document.body.innerHTML).toBe('<i>seed</i>');
  });

  it('rejects too many interpolations for the template', () => {
    const strs = capture`<p>${text('x')}</p>`;
    document.body.innerHTML = '<i>seed</i>';
    expect(() =>
      render(drive(strs, text('a'), text('b')) as never, document.body),
    ).toThrow('E11:1:2');
    expect(document.body.innerHTML).toBe('<i>seed</i>');
  });

  it('encodes the expected and actual counts in the error code', () => {
    const strs = capture`<p>${text('x')}</p><p>${text('y')}</p>`;
    expect(() =>
      render(
        drive(strs, text('a'), text('b'), text('c')) as never,
        document.body,
      ),
    ).toThrow('E11:2:3');
  });

  it('renders a template with more than 31 interpolations', () => {
    const host = document.createElement('div');
    const slots = 40;
    const sigs = Array.from({length: slots}, (_, i) => sig(i));
    const strs = Array.from({length: slots + 1}, (_, i) =>
      i === 0 ? '<ul>' : i === slots ? '<li></li></ul>' : '<li></li>',
    ) as unknown as TemplateStringsArray;

    render(html(strs, ...sigs.map((s) => text(s))), host);

    expect(host.querySelectorAll('li').length).toBe(slots);
    expect(host.textContent).toBe(
      Array.from({length: slots}, (_, i) => String(i)).join(''),
    );
  });

  it('renders a template with more than 31 patch slots', () => {
    const host = document.createElement('div');
    const slots = 40;
    const sigs = Array.from({length: slots}, (_, i) => sig(`v${i}`));
    const strs = Array.from({length: slots + 1}, (_, i) =>
      i === 0 ? '<ul><li ' : i === slots ? '></li></ul>' : '></li><li ',
    ) as unknown as TemplateStringsArray;

      render(html(strs, ...sigs.map((s) => patch(attr('data-v', s)))), host);

    const li = host.querySelectorAll('li');
    expect(li.length).toBe(slots);
    expect(li[0]?.getAttribute('data-v')).toBe('v0');
    expect(li[slots - 1]?.getAttribute('data-v')).toBe(`v${slots - 1}`);
  });

  it('renders 31 patch slots through the bitmask and 32 through the string fallback', () => {
    for (const slots of [31, 32]) {
      const host = document.createElement('div');
      const sigs = Array.from({length: slots}, (_, i) => sig(`v${i}`));
      const strs = Array.from({length: slots + 1}, (_, i) =>
        i === 0 ? '<ul><li ' : i === slots ? '></li></ul>' : '></li><li ',
      ) as unknown as TemplateStringsArray;

      render(html(strs, ...sigs.map((s) => patch(attr('data-v', s)))), host);

      const li = host.querySelectorAll('li');
      expect(li.length).toBe(slots);
      expect(li[slots - 1]?.getAttribute('data-v')).toBe(`v${slots - 1}`);
    }
  });

  it('renders primitive content interpolations as text', () => {
    render(html`<p>${'hi'} ${42}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>hi 42</p>');
  });

  it('stringifies nullish and boolean interpolations', () => {
    render(html`<p>${null}|${undefined}|${false}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>null|undefined|false</p>');
  });

  it('binds a Sig interpolation reactively and detaches on dispose', async () => {
    const name = sig('Alice');
    const dispose = render(html`<p>Hello, ${name}!</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>Hello, Alice!</p>');

    name.update('Bob');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<p>Hello, Bob!</p>');

    dispose();
    expect(name.getBinds().length).toBe(0);
  });

  it('mixes explicit views and primitive interpolations', () => {
    const n = sig(1);
    render(html`<p>${text(n)} and ${'x'}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>1 and x</p>');
  });

  it('shares one cache shape between a view and a primitive at the same slot', () => {
    const slot = (primitive: boolean) =>
      html`<p>${primitive ? 'plain' : text('wrapped')}</p>`;

    render(slot(true), document.body);
    expect(document.body.innerHTML).toBe('<p>plain</p>');

    document.body.innerHTML = '';
    render(slot(false), document.body);
    expect(document.body.innerHTML).toBe('<p>wrapped</p>');
  });

  it('rejects a primitive in an attribute position', () => {
    expect(() => render(html`<div class=${'x'}></div>`, document.body)).toThrow(
      'E12',
    );
  });
});
