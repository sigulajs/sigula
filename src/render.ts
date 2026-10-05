import {type AnyView, removeBoundary} from './core';

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
