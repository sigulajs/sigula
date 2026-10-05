import {type AnyView, at, type View} from './core';

/**
 * Renders a fixed array in order. `viewFn` is called once per item with the item
 * and its 0-based index, and each returned `AnyView` is appended in sequence.
 * There is no keying or reconciliation and no reactive source; any reactivity
 * comes from the views `viewFn` returns. An empty array renders
 * `<!--empty-list-->`.
 *
 * @typeParam T - the item type.
 * @param items - the items to render.
 * @param viewFn - builds the view for an item and its index.
 * @returns a `View` rendering the items.
 * @example
 * ```ts
 * html`<ul>${list(items, (item, i) => html`<li>${i}: ${text(item)}</li>`)}</ul>`;
 * ```
 * @group Control flow
 */
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
