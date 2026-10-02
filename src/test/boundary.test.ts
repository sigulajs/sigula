import {beforeEach, describe, expect, it} from 'vitest';
import {replaceWithNode, toBoundary} from '../boundary';

const text = (s: string) => document.createTextNode(s);
const el = (tag: string) => document.createElement(tag);

describe('replaceWithNode', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = el('div');
    document.body.appendChild(host);
  });

  it('keeps following siblings when the old boundary is a single node', () => {
    host.append(text('before'), text('target'), el('b'), el('i'));

    const target = host.childNodes[1] as Text;
    replaceWithNode(toBoundary(target), text('NEW'));

    expect(host.innerHTML).toBe('beforeNEW<b></b><i></i>');
  });

  it('keeps following siblings when the old boundary spans multiple nodes', () => {
    host.append(text('before'), text('a'), text('b'), el('i'));

    const start = host.childNodes[1] as Text;
    const end = host.childNodes[2] as Text;
    const frag = document.createDocumentFragment();
    frag.append(text('X'), text('Y'));
    replaceWithNode({start, end}, frag);

    expect(host.innerHTML).toBe('beforeXY<i></i>');
  });

  it('keeps following siblings when the single-node boundary is the last child', () => {
    host.append(el('b'), text('target'));

    replaceWithNode(toBoundary(host.childNodes[1] as Text), text('NEW'));

    expect(host.innerHTML).toBe('<b></b>NEW');
  });

  it('reports the new boundary spanning all inserted nodes', () => {
    host.append(text('a'), el('i'));

    const frag = document.createDocumentFragment();
    frag.append(text('X'), text('Y'));
    const boundary = replaceWithNode(
      toBoundary(host.childNodes[0] as Text),
      frag,
    );

    expect(boundary.start.textContent).toBe('X');
    expect(boundary.end.textContent).toBe('Y');
    expect(boundary.start).not.toBe(boundary.end);
  });

  it('throws when the old boundary has no parent', () => {
    const orphan = text('orphan');
    expect(() => replaceWithNode(toBoundary(orphan), text('X'))).toThrow(
      'replaceWithNode: old boundary has no parentNode',
    );
  });
});
