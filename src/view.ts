import {
  type AnyView,
  createBind,
  replaceWithView,
  type Sig,
  type View,
  type ViewContext,
} from './core';
import {detachBind, reattachBind} from './core/lifecycle';

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const newInner = ctx.viewFn(val);
  if (newInner === ctx.inner) return;
  const oldInner = ctx.inner;
  const oldBoundary = oldInner.boundary();
  replaceWithView(oldBoundary, newInner);
  oldInner.detach();
  newInner.reattach();
  ctx.inner = newInner;
};

/**
 * Conditionally renders one view or another. Whenever `sig` changes, `viewFn`
 * runs with the new value, the previous view is torn down, and a new one is
 * mounted in its place.
 *
 * @typeParam T - the value type.
 * @param sig - the signal to switch on.
 * @param viewFn - builds the view for a value.
 * @returns a `View` that swaps its contents.
 * @example
 * ```ts
 * html`<div>${view(isEmpty, (v) => (v ? text('empty') : listView))}</div>`;
 * ```
 * @group Control flow
 */
export const view = <T>(
  sig: Sig<T>,
  viewFn: (val: T) => AnyView,
): View<T, ViewContext<T>> => {
  const inner = viewFn(sig.get());

  const ctx: ViewContext<T> = {
    inner,
    viewFn,
  };

  const bind = createBind(sig, ctx, viewCmd);

  return {
    type: 'view',
    node: inner.node,
    bind,
    boundary: () => ctx.inner.boundary(),
    detach: () => {
      detachBind(bind);
      ctx.inner.detach();
    },
    reattach: () => {
      reattachBind(bind);
      ctx.inner.reattach();
    },
  };
};
