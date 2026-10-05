import {
  createBind,
  type PatchContext,
  removeBind,
  Sig,
  toBoundary,
  type View,
} from './core';

const textCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.node.textContent = String(val);
};

export const text = <T>(source: T | Sig<T>): View<T, PatchContext> => {
  const text = document.createTextNode(
    source instanceof Sig ? String(source.get()) : String(source),
  );
  const ctx: PatchContext = {node: text};
  const bind =
    source instanceof Sig ? createBind(source, ctx, textCmd) : undefined;
  const boundary = toBoundary(text);
  return {
    type: 'view',
    node: text,
    bind,
    boundary: () => boundary,
    cleanBinds: () => {
      if (bind) removeBind(bind);
    },
  };
};
