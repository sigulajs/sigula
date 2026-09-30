import type {Cmd, CmdContext} from './cmd';
import type {Sig} from './sig.bind';

export interface PatchContext extends CmdContext {
  // kind: 'elem';
  node: Node;
  extra?: unknown[];
}

export interface PatchItem<T> {
  source: T | Sig<T>;
  context: PatchContext;
  cmd: Cmd<T, PatchContext>;
}
export type ToPatchItem<T> = (el: Element) => PatchItem<T>;

export type AnyPatchItem = PatchItem<any>;
export type ToAnyPatchItem = (el: Element) => AnyPatchItem;

export interface Patch {
  type: 'patch';
  toPatchItems: ToAnyPatchItem[];
}

export const patch = (...toPatchItems: ToAnyPatchItem[]): Patch => ({
  type: 'patch',
  toPatchItems,
});

const idCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).id = String(val);
};

export const id =
  <T>(source: T | Sig<T>): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem},
    cmd: idCmd,
  });

const attrCmd = <T>(val: T, ctx: PatchContext) => {
  const key = ctx.extra ? ctx.extra[0] : null;
  if (!key) throw new Error('attrCmd: empty key');

  (ctx.node as Element).setAttribute(key as string, String(val));
};

export const attr =
  <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem, extra: [key]},
    cmd: attrCmd,
  });

export type WritableStyleKey = {
  [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string
    ? K
    : never;
}[keyof CSSStyleDeclaration];

const styleCmd = <T>(val: T, ctx: PatchContext) => {
  const key = ctx.extra ? ctx.extra[0] : null;
  if (!key) throw new Error('attrCmd: empty key');
  (ctx.elem as HTMLElement).style[key as WritableStyleKey] = String(val);
};

export const style =
  <T>(source: T | Sig<T>, key: WritableStyleKey): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem, extra: [key]},
    cmd: styleCmd,
  });

const stylePropertyCmd = <T>(val: T, ctx: PatchContext) => {
  const key = ctx.extra ? ctx.extra[0] : null;
  if (!key) throw new Error('attrCmd: empty key');
  (ctx.elem as HTMLElement).style.setProperty(key as string, String(val));
};

export const styleProperty =
  <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem, extra: [key]},
    cmd: stylePropertyCmd,
  });

const toggleClassCmd = <T>(val: T, ctx: PatchContext) => {
  const token = ctx.extra ? ctx.extra[0] : null;
  if (!token) throw new Error('attrCmd: empty key');
  (ctx.node as Element).classList.toggle(token as string, Boolean(val));
};

export const toggleClass =
  <T>(source: T | Sig<T>, token: string): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem, extra: [token]},
    cmd: toggleClassCmd,
  });

const toggleClassesCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.extra?.forEach((token) => {
    (ctx.node as Element).classList.toggle(token as string, Boolean(val));
  });
};

export const toggleClasses =
  <T>(source: T | Sig<T>, ...tokens: string[]): ToPatchItem<T> =>
  (elem: Element): PatchItem<T> => ({
    source,
    context: {node: elem, extra: tokens},
    cmd: toggleClassesCmd,
  });

export type ActFn<T> = (node: Node, val?: T) => void;

const actCmd = <T>(val: T, ctx: PatchContext) => {
  const fn = ctx.extra ? ctx.extra[0] : null;
  if (!fn) throw new Error('actCmd error: no function');
  (fn as ActFn<T>)(ctx.node, val);
};

export const act =
  <T>(source: T | Sig<T>, fn: ActFn<T>): ToPatchItem<T> =>
  (node: Node): PatchItem<T> => ({
    source,
    context: {node, extra: [fn]},
    cmd: actCmd,
  });

type _Listener<K extends keyof HTMLElementEventMap> = (
  this: HTMLElement,
  ev: HTMLElementEventMap[K],
) => unknown;

const onCmd = (listener: unknown, ctx: PatchContext) => {
  const type = ctx.extra?.[0] as string | undefined;
  const options = ctx.extra?.[1] as
    | boolean
    | AddEventListenerOptions
    | undefined;
  if (!type) throw new Error('onCmd no type');
  ctx.node.addEventListener(
    type,
    listener as EventListenerOrEventListenerObject,
    options,
  );
};

export const on =
  <K extends keyof HTMLElementEventMap>(
    type: K,
    listener: _Listener<K>,
    options?: boolean | AddEventListenerOptions,
  ): ToPatchItem<_Listener<K>> =>
  (node: Node): PatchItem<_Listener<K>> => ({
    source: listener,
    context: {node, extra: [type, options]},
    cmd: onCmd,
  });
