import {type Boundary, replaceWithNode} from './boundary';
import type {CmdContext} from './cmd';
import type {Patch} from './patch.core';
import type {Bind} from './sig.bind';

export type ChildView = AnyView | Patch;

// biome-ignore lint/suspicious/noExplicitAny: View with any context
export interface View<T = unknown, C extends CmdContext = any> {
  type: 'view';
  node: Node;
  bind?: Bind<T, C> | undefined;
  cleanBinds: () => void;
  boundary: () => Boundary;

  children?: ChildView[] | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: any view
export type AnyView = View<any, any>;

export interface ViewContext<T> extends CmdContext {
  inner: AnyView;
  viewFn: (val: T) => AnyView;
}

export const replaceWithView = (old: Boundary, view: View): Boundary =>
  replaceWithNode(old, view.node);
