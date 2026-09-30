import {type Boundary, repleaceWithNode, toBoundary} from './boundary';
import type {CmdContext} from './cmd';
import {type Commit, cleanCommit} from './commit';
import {type Bind, createBind, type Sig} from './sig.bind';

export interface View<T = unknown, C extends CmdContext = CmdContext> {
  type: 'view';
  // frag: DocumentFragment;
  node: Node;
  bind?: Bind<T, C>;
  childCommits?: Commit<unknown, CmdContext>[];
}

export type AnyView = View<any, any>;

export interface ViewContext<T> extends CmdContext {
  // kind: 'view';
  boundary: Boundary;
  childCommits?: Commit<unknown, CmdContext>[];
  viewFn: (val: T) => View;
}

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const view = ctx.viewFn(val);
  const newBoundary = replaceWithView(ctx.boundary, view);
  ctx.childCommits?.forEach((commit) => {
    cleanCommit(commit);
  });
  ctx.boundary = newBoundary;
  ctx.childCommits = view.childCommits;
};

export const view = <T>(
  sig: Sig<T>,
  viewFn: (val: T) => View,
): View<T, ViewContext<T>> => {
  const view = viewFn(sig.get());

  const boundary = extractBoundary(view);

  const ctx: ViewContext<T> = {
    boundary,
    viewFn,
    childCommits: view.childCommits,
  };

  const bind = createBind(sig, ctx, viewCmd);

  return {
    ...view,
    bind,
  };
};

export const extractBoundary = (view: View): Boundary => toBoundary(view.node);

export const replaceWithView = (old: Boundary, view: View): Boundary => {
  return repleaceWithNode(old, view.node);
};
