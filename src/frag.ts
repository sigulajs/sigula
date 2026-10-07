import type {AnyView, View} from './core';
import {composeViews} from './core/compose';

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
export const frag = (...views: AnyView[]): View =>
  composeViews(
    views,
    views.length === 0 ? document.createTextNode('') : undefined,
  );
