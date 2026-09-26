import {
  type AnySlot,
  type BaseContext,
  type Boundary,
  type Commit,
  cleanCommit,
  createBind,
  extractBoundary,
  replaceWithSlot,
  type Sig,
  type Slot,
} from './common';

export interface ViewContext<T> extends BaseContext {
  // kind: 'view';
  boundary: Boundary;
  childCommits?: Commit<unknown, BaseContext>[];
  slotFn: (val: T) => AnySlot;
}

const viewCmd = <T>(val: T, ctx: ViewContext<T>) => {
  const slot = ctx.slotFn(val);
  const newBoundary = replaceWithSlot(ctx.boundary, slot);
  ctx.childCommits?.forEach((commit) => {
    cleanCommit(commit);
  });
  ctx.boundary = newBoundary;
  ctx.childCommits = slot.childCommits;
};

export const view = <T>(
  sig: Sig<T>,
  slotFn: (val: T) => AnySlot,
): Slot<T, ViewContext<T>> => {
  const slot = slotFn(sig.get());

  const boundary = extractBoundary(slot);

  const ctx: ViewContext<T> = {
    boundary,
    slotFn,
    childCommits: slot.childCommits,
  };

  const bind = createBind(sig, ctx, viewCmd);

  return {
    ...slot,
    bind,
  };
};
