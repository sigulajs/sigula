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
});
