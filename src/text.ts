import {createBind, type PatchContext, Sig, type Slot} from './common';

const textCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.node.textContent = String(val);
};

export const text = <T>(source: T | Sig<T>): Slot<T, PatchContext> => {
  const text = document.createTextNode(
    source instanceof Sig ? String(source.get()) : String(source),
  );
  const ctx: PatchContext = {node: text};
  const bind =
    source instanceof Sig ? createBind(source, ctx, textCmd) : undefined;
  return {
    type: 'slot',
    node: text,
    bind,
  };
};
