import {type AnyView, removeBoundary} from './core';

/**
 * Mounts a view into `node` by appending its `node`. Accepts a `View` directly
 * or a factory function that returns one. Returns a disposer that detaches every
 * bind in the tree and removes the nodes from `node`; calling it twice is a
 * no-op.
 *
 * @param viewArg - the view, or a function returning one.
 * @param node - the node to mount into.
 * @returns a disposer that unmounts the view.
 * @example
 * ```ts
 * const dispose = render(App(), document.querySelector('#app')!);
 * dispose();
 * ```
 * @group Rendering
 */
export const render = (
  viewArg: AnyView | (() => AnyView),
  node: Node,
): (() => void) => {
  const view = typeof viewArg === 'function' ? viewArg() : viewArg;
  node.appendChild(view.node);

  return () => {
    removeBoundary(view.boundary());
    view.cleanBinds();
  };
};
