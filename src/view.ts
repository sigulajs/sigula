import {
  type BaseContext,
  type Boundary,
  type Commit,
  cleanCommit,
  createBind,
  extractBoundary,
  replaceWithView,
  type Sig,
  type View,
} from './common';

export interface ViewContext<T> extends BaseContext {
  // kind: 'view';
  boundary: Boundary;
  childCommits?: Commit<unknown, BaseContext>[];
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
