import {
  type AnyView,
  createBind,
  removeBind,
  replaceWithView,
  type Sig,
  type View,
  type ViewContext,
} from './core';

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const oldBoundary = ctx.inner.boundary();
  const newInner = ctx.viewFn(val);
  replaceWithView(oldBoundary, newInner);
  ctx.inner.cleanBinds();
  ctx.inner = newInner;
};

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
    cleanBinds: () => {
      removeBind(bind);
      ctx.inner.cleanBinds();
    },
  };
};
