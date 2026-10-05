import {
  type Cmd,
  err,
  type Patch,
  type PatchContext,
  type Reactive,
  type Sig,
  type ToAnyPatchItem,
  type ToPatchItem,
} from './core';

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

export const attr = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
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
  key: WritableStyleKey,
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [key], styleCmd);

const stylePropCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

export const styleProp = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, [key], stylePropCmd);

const toggleClassCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).classList.toggle(_key(ctx), Boolean(val));
};

export const toggleClass = <T>(
  token: string,
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [token], toggleClassCmd);

const toggleClassesCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.extra?.forEach((token) => {
    (ctx.node as Element).classList.toggle(token as string, Boolean(val));
  });
};

export const toggleClasses = <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [...tokens], toggleClassesCmd);

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
          if (v !== undefined) items.push(toggleClass(token, v));
        }
        break;
      case 'style':
        for (const [name, v] of Object.entries(
          value as Partial<Record<WritableStyleKey, Reactive<string>>>,
        )) {
          if (v !== undefined) items.push(style(name as WritableStyleKey, v));
        }
        break;
      case 'styleProp':
        for (const [name, v] of Object.entries(
          value as Record<string, Reactive<string>>,
        )) {
          if (v !== undefined) items.push(styleProp(name, v));
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
        items.push(attr(key, value));
    }
  }
  return items;
};
