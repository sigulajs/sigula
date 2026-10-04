import {removeBoundary} from './boundary';
import type {AnyView} from './view';

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
