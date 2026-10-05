import {type AnyView, at, type View} from './core';

export const list = <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
): View => {
  if (items.length === 0) {
    const empty = document.createComment('empty-list');
    return {
      type: 'view',
      node: empty,
      boundary: () => ({start: empty, end: empty}),
      cleanBinds: () => {},
    };
  }

  const frag = document.createDocumentFragment();
  const views: AnyView[] = [];

  items.forEach((item, index) => {
    const view = viewFn(item, index);
    views.push(view);
    frag.appendChild(view.node);
  });

  return {
    type: 'view',
    node: frag,
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
