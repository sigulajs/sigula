import {beforeEach, describe, expect, it} from 'vitest';
import {html, id, patch, render} from '..';

describe('patch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('id', () => {
    render(html`<div ${patch(id('test'))}>test</div>`, document.body);
    expect(document.getElementById('test')?.innerHTML).toBe('test');
  });
});
