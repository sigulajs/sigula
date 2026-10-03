import {type Boundary, replaceWithNode, toBoundary} from './boundary';
import type {CmdContext} from './cmd';
import {type Commit, cleanCommit} from './commit';
import {
  type AnyBind,
  type Bind,
  createBind,
  removeBind,
  type Sig,
} from './sig.bind';

// biome-ignore lint/suspicious/noExplicitAny: View with any context
export interface View<T = unknown, C extends CmdContext = any> {
  type: 'view';
  node: Node;
  bind?: Bind<T, C> | undefined;
  childCommits?: Commit<unknown, CmdContext>[];
  live?: () => Boundary | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: any view
export type AnyView = View<any, any>;

interface ViewContext<T> extends CmdContext {
  boundary: Boundary;
  bind?: AnyBind | undefined;
  childCommits?: Commit<unknown, CmdContext>[] | undefined;
  viewFn: (val: T) => View;
}

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const view = ctx.viewFn(val);
  const newBoundary = replaceWithView(ctx.boundary, view);
  if (ctx.bind) removeBind(ctx.bind);
  ctx.childCommits?.forEach((commit) => {
    cleanCommit(commit);
  });
  ctx.boundary = newBoundary;
  ctx.bind = view.bind;
  ctx.childCommits = view.childCommits;
};

export const view = <T>(
  sig: Sig<T>,
  viewFn: (val: T) => AnyView,
): View<T, ViewContext<T>> => {
  const view = viewFn(sig.get());

  const boundary = extractBoundary(view);

  const ctx: ViewContext<T> = {
    boundary,
    bind: view.bind,
    viewFn,
    childCommits: view.childCommits,
  };

  const bind = createBind(sig, ctx, viewCmd);

  return {
    ...view,
    bind,
    live: () => ctx.boundary,
  };
};

export const extractBoundary = (view: View): Boundary => toBoundary(view.node);

export const replaceWithView = (old: Boundary, view: View): Boundary => {
  return replaceWithNode(old, view.node);
};
