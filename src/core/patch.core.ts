import type {Cmd, CmdContext} from './cmd';
import type {Sig} from './sig.bind';

export interface Patch {
  type: 'patch';
  toPatchItems: ToAnyPatchItem[];
  cleanBinds: () => void;
}

export interface PatchContext extends CmdContext {
  node: Node;
  extra?: unknown[];
}

export interface PatchItem<T> {
  source: T | Sig<T>;
  context: PatchContext;
  cmd: Cmd<T, PatchContext>;
}
export type ToPatchItem<T> = (el: Element) => PatchItem<T>;

// biome-ignore lint/suspicious/noExplicitAny: any patch item
export type AnyPatchItem = PatchItem<any>;
export type ToAnyPatchItem = (el: Element) => AnyPatchItem;
