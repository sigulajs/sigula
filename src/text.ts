import {
  createBind,
  type PatchContext,
  Sig,
  toBoundary,
  type View,
} from './core';
import {detachBinds, reattachBinds} from './core/lifecycle';

const textCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.node.textContent = String(val);
};

/**
 * Creates a text-node view. With a `Sig`, the text updates whenever the signal
 * changes; a plain value is static.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a text `View`.
 * @example
 * ```ts
 * html`<span>${text(count)}</span>`;
 * ```
 * @group Templates
 */
export const text = <T>(source: T | Sig<T>): View<T, PatchContext> => {
  const text = document.createTextNode(
    source instanceof Sig ? String(source.get()) : String(source),
  );
  const ctx: PatchContext = {node: text};
  const bind =
    source instanceof Sig ? createBind(source, ctx, textCmd) : undefined;
  const boundary = toBoundary(text);
  const binds = bind ? [bind] : [];
  return {
    type: 'view',
    node: text,
    bind,
    attached: true,
    boundary: () => boundary,
    detach() {
      detachBinds(this, binds);
    },
    reattach() {
      reattachBinds(this, binds);
    },
  };
};
