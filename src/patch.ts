import type {Boundary} from './boundary';
import type {Cmd, CmdContext} from './cmd';
import type {AnyBind, Sig} from './sig.bind';

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

// biome-ignore lint/suspicious/noExplicitAny: any patch item
export type AnyPatchItem = PatchItem<any>;
export type ToAnyPatchItem = (el: Element) => AnyPatchItem;

const _emptyFn = (): void => {};
const _notImp = (): Boundary => {
  throw new Error('not imp');
};
export interface Patch {
  type: 'patch';
  toPatchItems: ToAnyPatchItem[];
  isCommited?: boolean;
  binds?: AnyBind[];
  cleanBinds: () => void;
  boundary: () => Boundary;
}

export const patch = (...toPatchItems: ToAnyPatchItem[]): Patch => ({
  type: 'patch',
  toPatchItems,
  cleanBinds: _emptyFn,
  boundary: _notImp,
});

// Every patch item is the same shape -- bind `source` to `elem` plus whatever
// arguments the command needs -- so the whole body lives here once.
const _toPatchItem =
  <T>(
    source: T | Sig<T>,
    extra: unknown[] | undefined,
    cmd: Cmd<T, PatchContext>,
  ): ToPatchItem<T> =>
  (elem) => ({
    source,
    context: extra ? {node: elem, extra} : {node: elem},
    cmd,
  });

// most commands take their attribute/style/class name as the first extra
const _key = (ctx: PatchContext): string => {
  const key = ctx.extra?.[0];
  if (!key) throw new Error('patch: empty key');
  return key as string;
};

const idCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).id = String(val);
};

export const id = <T>(source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, undefined, idCmd);

const valCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as unknown as {value: string}).value = String(val);
};

export const val = <T>(source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, undefined, valCmd);

const attrCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).setAttribute(_key(ctx), String(val));
};

export const attr = <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  _toPatchItem(source, [key], attrCmd);

export type WritableStyleKey = {
  [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string
    ? K
    : never;
}[keyof CSSStyleDeclaration];

const styleCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style[_key(ctx) as WritableStyleKey] = String(val);
};

export const style = <T>(
  source: T | Sig<T>,
  key: WritableStyleKey,
): ToPatchItem<T> => _toPatchItem(source, [key], styleCmd);

const stylePropertyCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

export const styleProperty = <T>(
  source: T | Sig<T>,
  key: string,
): ToPatchItem<T> => _toPatchItem(source, [key], stylePropertyCmd);

const toggleClassCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).classList.toggle(_key(ctx), Boolean(val));
};

export const toggleClass = <T>(
  source: T | Sig<T>,
  token: string,
): ToPatchItem<T> => _toPatchItem(source, [token], toggleClassCmd);

const toggleClassesCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.extra?.forEach((token) => {
    (ctx.node as Element).classList.toggle(token as string, Boolean(val));
  });
};

export const toggleClasses = <T>(
  source: T | Sig<T>,
  ...tokens: string[]
): ToPatchItem<T> => _toPatchItem(source, tokens, toggleClassesCmd);

export type ActFn<T> = (node: Node, val?: T) => void;

const actCmd = <T>(val: T, ctx: PatchContext) => {
  const fn = ctx.extra?.[0] as ActFn<T> | undefined;
  if (!fn) throw new Error('patch: no function');
  fn(ctx.node, val);
};

export const act = <T>(source: T | Sig<T>, fn: ActFn<T>): ToPatchItem<T> =>
  _toPatchItem(source, [fn], actCmd);

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
  if (!type) throw new Error('patch: no event type');
  ctx.node.addEventListener(
    type,
    listener as EventListenerOrEventListenerObject,
    options,
  );
};

export const on = <K extends keyof HTMLElementEventMap>(
  type: K,
  listener: _Listener<K>,
  options?: boolean | AddEventListenerOptions,
): ToPatchItem<_Listener<K>> => _toPatchItem(listener, [type, options], onCmd);
