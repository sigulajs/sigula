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
      html`<td>${live ? patch(toggleClass(sig('on'), 'hot')) : text('-')}</td>`;

    render(cell(false), document.body);
    expect(document.body.innerHTML).toBe('<td>-</td>');

    expect(() => render(cell(true), document.body)).toThrowError(
      /patch\(\) must be in attribute position/,
    );
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
    expect(() => render(drive(strs) as never, document.body)).toThrowError(
      /expected 1 interpolation, got 0/,
    );
    expect(document.body.innerHTML).toBe('<i>seed</i>');
  });

  it('rejects too many interpolations for the template', () => {
    const strs = capture`<p>${text('x')}</p>`;
    document.body.innerHTML = '<i>seed</i>';
    expect(() =>
      render(drive(strs, text('a'), text('b')) as never, document.body),
    ).toThrowError(/expected 1 interpolation, got 2/);
    expect(document.body.innerHTML).toBe('<i>seed</i>');
  });

  it('pluralises the expected count when a template has several slots', () => {
    const strs = capture`<p>${text('x')}</p><p>${text('y')}</p>`;
    expect(() =>
      render(
        drive(strs, text('a'), text('b'), text('c')) as never,
        document.body,
      ),
    ).toThrowError(/expected 2 interpolations, got 3/);
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

    render(html(strs, ...sigs.map((s) => patch(attr(s, 'data-v')))), host);

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

      render(html(strs, ...sigs.map((s) => patch(attr(s, 'data-v')))), host);

      const li = host.querySelectorAll('li');
      expect(li.length).toBe(slots);
      expect(li[slots - 1]?.getAttribute('data-v')).toBe(`v${slots - 1}`);
    }
  });
});
