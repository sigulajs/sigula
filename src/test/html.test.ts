import {beforeEach, describe, expect, it} from 'vitest';
import {html, patch, render, sig, text, toggleClass, view} from '..';

describe('html', () => {
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
    const capture = (s: TemplateStringsArray, ..._: unknown[]) => s;
    const strs = capture`<p>${text('x')}</p>`;
    const drive = html as unknown as (
      s: TemplateStringsArray,
      ...items: unknown[]
    ) => unknown;

    expect(() => render(drive(strs) as never, document.body)).toThrowError(
      /expected 1 interpolation, got 0/,
    );
    expect(document.body.innerHTML).toBe('');
  });

  it('rejects too many interpolations for the template', () => {
    const capture = (s: TemplateStringsArray, ..._: unknown[]) => s;
    const strs = capture`<p>${text('x')}</p>`;
    const drive = html as unknown as (
      s: TemplateStringsArray,
      ...items: unknown[]
    ) => unknown;

    expect(() =>
      render(drive(strs, text('a'), text('b')) as never, document.body),
    ).toThrowError(/expected 1 interpolation, got 2/);
    expect(document.body.innerHTML).toBe('');
  });
});
