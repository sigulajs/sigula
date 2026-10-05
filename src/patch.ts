import type {Cmd, CmdContext} from './cmd';
import {err} from './err';
import type {Sig} from './sig.bind';

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

type Reactive<T> = T | Sig<T> | undefined;

export interface PatchProps {
  id?: Reactive<string>;
  val?: Reactive<string>;
  class?: Record<string, Reactive<boolean>>;
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  styleProp?: Record<string, Reactive<string>>;
  on?: {
    [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
  };
  [attr: string]: unknown;
}

const _noop = (): void => {};
export interface Patch {
  type: 'patch';
  toPatchItems: ToAnyPatchItem[];
  cleanBinds: () => void;
}

export function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
export function patch(...toPatchItems: ToAnyPatchItem[]): Patch;
export function patch(
  first?: PatchProps | ToAnyPatchItem,
  ...rest: ToAnyPatchItem[]
): Patch {
  const toPatchItems =
    typeof first === 'function'
      ? [first, ...rest]
      : first
        ? [..._propsToItems(first), ...rest]
        : rest;
  return {type: 'patch', toPatchItems, cleanBinds: _noop};
}

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
  if (!key) err('E4');
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

const stylePropCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

export const styleProp = <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  _toPatchItem(source, [key], stylePropCmd);

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

export type ActFn<T> = (elem: Element, val?: T) => void;

const actCmd = <T>(val: T, ctx: PatchContext) => {
  const fn = ctx.extra?.[0] as ActFn<T> | undefined;
  if (!fn) err('E5');
  fn(ctx.node as Element, val);
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
  if (!type) err('E6');
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

const _propsToItems = (props: PatchProps): ToAnyPatchItem[] => {
  const items: ToAnyPatchItem[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    switch (key) {
      case 'id':
        items.push(id(value as NonNullable<Reactive<string>>));
        break;
      case 'val':
        items.push(val(value as NonNullable<Reactive<string>>));
        break;
      case 'class':
        for (const [token, v] of Object.entries(
          value as Record<string, Reactive<boolean>>,
        )) {
          if (v !== undefined) items.push(toggleClass(v, token));
        }
        break;
      case 'style':
        for (const [name, v] of Object.entries(
          value as Partial<Record<WritableStyleKey, Reactive<string>>>,
        )) {
          if (v !== undefined) items.push(style(v, name as WritableStyleKey));
        }
        break;
      case 'styleProp':
        for (const [name, v] of Object.entries(
          value as Record<string, Reactive<string>>,
        )) {
          if (v !== undefined) items.push(styleProp(v, name));
        }
        break;
      case 'on':
        for (const [type, listener] of Object.entries(
          value as Record<string, _Listener<keyof HTMLElementEventMap>>,
        )) {
          if (listener !== undefined) {
            items.push(on(type as keyof HTMLElementEventMap, listener));
          }
        }
        break;
      default:
        items.push(attr(value, key));
    }
  }
  return items;
};
