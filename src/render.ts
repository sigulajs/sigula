import type {View} from './common';

export const render = (viewArg: View | (() => View), node: Node) => {
  const view = typeof viewArg === 'function' ? viewArg() : viewArg;
  node.appendChild(view.node);
};
