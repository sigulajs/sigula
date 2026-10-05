import {type AnyView, toBoundary, type View} from './core';

export const list = <T>(
  items: readonly T[],
  viewFn: (item: T, index: number) => AnyView,
): View => {
  const frag = document.createDocumentFragment();
  const views: AnyView[] = [];

  items.forEach((item, index) => {
    const view = viewFn(item, index);
    views.push(view);
    frag.appendChild(view.node);
  });

  if (items.length === 0) {
    frag.appendChild(document.createComment('empty-list'));
  }

  // Compute the boundary before the fragment is inserted: inserting a fragment
  // moves its children out and empties it, so a lazy toBoundary(frag) would
  // throw E2 at dispose time.
  const boundary = toBoundary(frag);

  return {
    type: 'view',
    node: frag,
    boundary: () => boundary,
    cleanBinds: () => {
      views.forEach((view) => {
        view.cleanBinds();
      });
    },
  };
};
