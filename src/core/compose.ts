import {at} from './utils';
import type {AnyView, View} from './view.core';

export const composeViews = (views: AnyView[], empty?: Node): View => {
  if (views.length === 0) {
    const node = empty ?? document.createTextNode('');
    return {
      type: 'view',
      node,
      boundary: () => ({start: node, end: node}),
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
