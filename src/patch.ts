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

/**
 * Object form for {@link patch}, desugared into commands in key order:
 * `id`, `val`, `class` (per entry, via `toggleClass`), `style` (per entry,
 * via `style`), `styleProp` (per entry), `on` (per entry), and any other key
 * via `attr`. A key whose value is `undefined` is skipped.
 *
 * @group DOM bindings
 */
export interface PatchProps {
  /** Sets the element's `id`. */
  id?: Reactive<string>;
  /** Sets the element's `value` property. */
  val?: Reactive<string>;
  /** Toggles each class from the truthiness of its value. */
  class?: Record<string, Reactive<boolean>>;
  /** Sets inline style properties by typed name. */
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  /** Sets style properties via `setProperty` (custom properties, untyped names). */
  styleProp?: Record<string, Reactive<string>>;
  /** Registers DOM event listeners. */
  on?: {
    [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
  };
  /** Any other key is set as an attribute via `attr`. */
  [attr: string]: unknown;
}

const _noop = (): void => {};

/**
 * Declares one or more bindings to apply to the same element; must be
 * interpolated in an attribute position. Each command receives a plain value
 * (applied once) or a `Sig` (applied on mount and re-applied on change).
 *
 * The first argument may be a {@link PatchProps} object, desugared into the
 * commands below in key order, optionally followed by command items.
 *
 * @param props - a props object.
 * @param items - command items applied after the props.
 * @returns a `Patch` for `html` to commit.
 * @example
 * ```ts
 * html`<input ${patch({val: name, placeholder: 'name'})} />`;
 * ```
 * @group DOM bindings
 */
export function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
/**
 * Declares one or more command bindings to apply to the same element.
 *
 * @param toPatchItems - the command items to apply.
 * @returns a `Patch` for `html` to commit.
 * @example
 * ```ts
 * html`<input ${patch(val(name), attr('name', placeholder))} />`;
 * ```
 * @group DOM bindings
 */
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

/**
 * Builds a deferred patch item: a factory that resolves against the target
 * element on mount and pairs a source value with a command. This is the shared
 * primitive behind `id`, `val`, `attr`, `style`, `styleProp`, `toggleClass`,
 * `toggleClasses`, `act`, and `on`.
 *
 * @typeParam T - the source value type.
 * @param source - the plain value or `Sig` the command binds.
 * @param extra - extra command arguments, such as the attribute or style key.
 * @param cmd - the command run with the value and context.
 * @returns a factory that builds the `PatchItem` for an element.
 * @group Low-level API
 */
export const toPatchItem =
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

/**
 * Sets the element's `id`.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const id = <T>(source: T | Sig<T>): ToPatchItem<T> =>
  toPatchItem(source, undefined, idCmd);

const valCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as unknown as {value: string}).value = String(val);
};

/**
 * Sets the element's `value` property (form controls).
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const val = <T>(source: T | Sig<T>): ToPatchItem<T> =>
  toPatchItem(source, undefined, valCmd);

const attrCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).setAttribute(_key(ctx), String(val));
};

/**
 * Sets attribute `key`. Use this for boolean/ARIA/data attributes.
 *
 * @typeParam T - the value type.
 * @param key - the attribute name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const attr = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  toPatchItem(source, [key], attrCmd);

/**
 * The union of `CSSStyleDeclaration` keys whose values are strings.
 *
 * @group DOM bindings
 */
export type WritableStyleKey = {
  [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string
    ? K
    : never;
}[keyof CSSStyleDeclaration];

const styleCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style[_key(ctx) as WritableStyleKey] = String(val);
};

/**
 * Sets an inline style property by typed name.
 *
 * @typeParam T - the value type.
 * @param key - the typed style property name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<span ${patch(style('color', color))}>text</span>`;
 * ```
 * @group DOM bindings
 */
export const style = <T>(
  key: WritableStyleKey,
  source: T | Sig<T>,
): ToPatchItem<T> => toPatchItem(source, [key], styleCmd);

const stylePropCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

/**
 * Sets a style property via `CSSStyleDeclaration.setProperty`; use this for
 * custom properties (`--my-var`) or untyped names.
 *
 * @typeParam T - the value type.
 * @param key - the style property name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<div ${patch(styleProp('--size', size))}></div>`;
 * ```
 * @group DOM bindings
 */
export const styleProp = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  toPatchItem(source, [key], stylePropCmd);

const toggleClassCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as Element).classList.toggle(_key(ctx), Boolean(val));
};

/**
 * Toggles a single class from the truthiness of the value.
 *
 * @typeParam T - the value type.
 * @param token - the class token.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const toggleClass = <T>(
  token: string,
  source: T | Sig<T>,
): ToPatchItem<T> => toPatchItem(source, [token], toggleClassCmd);

const toggleClassesCmd = <T>(val: T, ctx: PatchContext) => {
  ctx.extra?.forEach((token) => {
    (ctx.node as Element).classList.toggle(token as string, Boolean(val));
  });
};

/**
 * Toggles several classes from one value.
 *
 * @typeParam T - the value type.
 * @param tokens - the class tokens.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const toggleClasses = <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
): ToPatchItem<T> => toPatchItem(source, [...tokens], toggleClassesCmd);

/**
 * A custom patch callback run on mount and on change.
 *
 * @typeParam T - the value type.
 * @group DOM bindings
 */
export type ActFn<T> = (elem: Element, val?: T) => void;

const actCmd = <T>(val: T, ctx: PatchContext) => {
  const fn = ctx.extra?.[0] as ActFn<T> | undefined;
  if (!fn) err('E5');
  fn(ctx.node as Element, val);
};

/**
 * Runs arbitrary code with the bound node and value, on mount and again on
 * change. The escape hatch for anything the built-in commands do not cover.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @param fn - called with the node and current value.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<canvas ${patch(act(frame, (node, v) => draw(node, v)))}></canvas>`;
 * ```
 * @group DOM bindings
 */
export const act = <T>(source: T | Sig<T>, fn: ActFn<T>): ToPatchItem<T> =>
  toPatchItem(source, [fn], actCmd);

const refCmd = (_val: null, ctx: PatchContext) => {
  const target = ctx.extra?.[0] as Sig<Element | null> | undefined;
  if (!target) return;
  target.update(ctx.node as Element);
  ctx.cleanup = () => target.update(null);
};

/**
 * Captures the patched element into `target` on mount, and resets `target` to
 * `null` when the patch is torn down. Must be interpolated in an attribute
 * position.
 *
 * @typeParam T - the element type.
 * @param target - a signal that receives the element, or `null`.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * const input = sig<HTMLInputElement | null>(null);
 * html`<input ${patch(ref(input))} />`;
 * input.get(); // the element, or null
 * ```
 * @group DOM bindings
 */
export const ref = <T extends Element>(
  target: Sig<T | null>,
): ToPatchItem<null> => toPatchItem(null, [target], refCmd);

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

/**
 * Adds a DOM event listener. The listener is registered once at mount and is
 * not a reactive source; combine it with `sig` writes to drive updates.
 *
 * @typeParam K - the event type.
 * @param type - the event name.
 * @param listener - the event listener.
 * @param options - standard `addEventListener` options.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
export const on = <K extends keyof HTMLElementEventMap>(
  type: K,
  listener: _Listener<K>,
  options?: boolean | AddEventListenerOptions,
): ToPatchItem<_Listener<K>> => toPatchItem(listener, [type, options], onCmd);

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
