import {type AnyView, at, type View} from './core';

/**
 * Composes several views into one content-position view. The views' nodes are
 * inserted as flat siblings, in order, with no wrapper element; nested
 * fragments flatten. Reactivity comes from the child views. `frag()` with no
 * arguments renders nothing.
 *
 * @param views - the views to compose.
 * @returns a `View` rendering the views as siblings.
 * @example
 * ```ts
 * html`<div>${frag(text('a'), html`<b>${text('b')}</b>`)}</div>`;
 * ```
 * @group Control flow
 */
export const frag = (...views: AnyView[]): View => {
  if (views.length === 0) {
    const empty = document.createTextNode('');
    return {
      type: 'view',
      node: empty,
      boundary: () => ({start: empty, end: empty}),
      cleanBinds: () => {},
    };
  }

  const node = document.createDocumentFragment();
  views.forEach((view) => {
    node.appendChild(view.node);
  });

  return {
    type: 'view',
    node,
    // Derive the boundary from the child views on demand: an edge view() can
    // swap its root node, and a boundary captured at construction would point
    // at the detached old node, leaking on teardown.
    boundary: () => {
      const first = at(views, 0);
      const last = at(views, views.length - 1);
      return {start: first.boundary().start, end: last.boundary().end};
    },
    cleanBinds: () => {
      views.forEach((view) => {
        view.cleanBinds();
      });
    },
  };
};
