import {type Boundary, replaceWithNode, toBoundary} from './boundary';
import type {CmdContext} from './cmd';
import type {Patch} from './patch';
import {type Bind, createBind, removeBind, type Sig} from './sig.bind';

export type ChildView = AnyView | Patch;

// biome-ignore lint/suspicious/noExplicitAny: View with any context
export interface View<T = unknown, C extends CmdContext = any> {
  type: 'view';
  node: Node;
  bind?: Bind<T, C> | undefined;
  cleanBinds: () => void;
  boundary: () => Boundary;

  isCommited?: boolean;
  children?: ChildView[] | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: any view
export type AnyView = View<any, any>;

export interface ViewContext<T> extends CmdContext {
  inner: AnyView;
  viewFn: (val: T) => AnyView;
}

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const oldBoundary = ctx.inner.boundary();
  const newInner = ctx.viewFn(val);
  if (!oldBoundary) throw new Error('empty boundary');
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

export const extractBoundary = (view: View): Boundary => toBoundary(view.node);

export const replaceWithView = (old: Boundary, view: View): Boundary => {
  return replaceWithNode(old, view.node);
};
