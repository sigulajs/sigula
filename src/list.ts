import type {AnyView, View} from './core';
import {composeViews} from './core/compose';

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
  const views = items.map((item, index) => viewFn(item, index));
  return composeViews(
    views,
    views.length === 0 ? document.createComment('empty-list') : undefined,
  );
};
