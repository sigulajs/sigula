import type {PatchContext} from './patch';
import {createBind, Sig} from './sig.bind';
import type {View} from './view';

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
  return {
    type: 'view',
    node: text,
    bind,
  };
};
