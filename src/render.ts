import type {AnyView} from './view';

export const render = (viewArg: AnyView | (() => AnyView), node: Node) => {
  const view = typeof viewArg === 'function' ? viewArg() : viewArg;
  node.appendChild(view.node);
};
