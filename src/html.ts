import {
  type AnyView,
  at,
  type Bind,
  type CmdContext,
  createBind,
  err,
  type Patch,
  type PatchContext,
  removeBind,
  Sig,
  toBoundary,
  type View,
} from './core';
import {text} from './text';

const MARK = `@sig_${Math.random().toFixed(9).slice(2)}`;

interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
  // a bitmask for up to 31 slots, the string form beyond that
  shape: number | string;
}

interface Wrap<T, C extends CmdContext> {
  item: Patch | View<T, C>;
  node: Node;
}

const tplCache = new WeakMap<TemplateStringsArray, Tpl>();

let walker: TreeWalker | undefined;

// Created on first use rather than at module scope so that importing sigula
// stays side-effect free and works where there is no document (SSR, tests).
const _walker = (): TreeWalker => {
  walker ??= document.createTreeWalker(
    document,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );
  return walker;
};

const _toMark = (item: Patch | View): string =>
  item.type === 'patch' ? MARK : `<!--${MARK}-->`;

// The markup of a call site depends on the kind of every interpolation: a patch
// gets an attribute marker, a view gets a comment marker. Reusing a cached
// template across a different mix would hand the wrong node type to
// commitPatch/commitView, so the mix is part of the cache identity.
// A bitmask is far cheaper to build and compare than a string, and 31 slots
// keeps it a non-negative int32 — 1 << 31 flips the sign. Beyond that fall
// back to the string form so wide templates keep working unchanged.
const MAX_MASKED_SLOTS = 31;

const _shape = (items: readonly (Patch | AnyView)[]): number | string => {
  if (items.length > MAX_MASKED_SLOTS) {
    let shape = '';
    for (const item of items) shape += item.type === 'patch' ? 'p' : 'v';
    return shape;
  }
  let bits = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.type === 'patch') bits |= 1 << i;
  }
  return bits;
};

const _hasMark = (el: Element) => el.hasAttribute(MARK);
const _rmMark = (el: Element) => el.removeAttribute(MARK);
const _isViewMark = (item: Comment) => item.data.trim() === MARK;

const isPatch = (item: unknown): item is Patch =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'patch';

const isView = (item: unknown): item is AnyView =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'view';

const _toItem = (item: unknown): Patch | AnyView =>
  isPatch(item) || isView(item) ? item : text(item);

const commitView = <T, C extends CmdContext>(view: View<T, C>, node: Node) => {
  (node as Comment).replaceWith(view.node);
};

const commitPatch = (patch: Patch, node: Node) => {
  const binds: Bind<unknown, PatchContext>[] = [];
  patch.toPatchItems.forEach((toPatchItem) => {
    const item = toPatchItem(node as Element);
    if (item.source instanceof Sig) {
      item.cmd(item.source.get(), item.context);
      binds.push(createBind(item.source, item.context, item.cmd));
    } else {
      item.cmd(item.source, item.context);
    }
  });

  patch.cleanBinds = () => {
    binds.forEach(removeBind);
  };
};

// Both template passes walk the same tree hunting for the next interpolation
// slot and then do exactly the same thing with it; only the way a slot is
// recognised differs, so that part is the only argument.
const _scan = (
  frag: DocumentFragment,
  items: (Patch | AnyView)[],
  wraps: Wrap<unknown, CmdContext>[],
  hit: (node: Node, nodeIndex: number, itemIndex: number) => boolean,
  indexes?: number[],
) => {
  const w = _walker();
  w.currentNode = frag;
  let node = w.nextNode();
  let nodeIndex = 0;
  let itemIndex = 0;
  while (node !== null && itemIndex < items.length) {
    if (hit(node, nodeIndex, itemIndex)) {
      wraps.push({item: at(items, itemIndex), node});
      if (indexes) indexes.push(nodeIndex);
      itemIndex++;
      if (node.nodeType === Node.ELEMENT_NODE) _rmMark(node as Element);
    }
    node = w.nextNode();
    nodeIndex++;
  }
  // https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/lit-html.ts#L1260
  // We need to set the currentNode away from the cloned tree so that we
  // don't hold onto the tree even if it is detached and should be freed.
  w.currentNode = document;
};

type TextValue = string | number | boolean | bigint | null | undefined;
type HtmlItem = Patch | AnyView | TextValue | Sig<any>;

/**
 * Tagged template that parses native HTML and returns a {@link View}. Three
 * kinds of interpolation are supported:
 *
 * - a `View` fills a content position;
 * - a `Patch` (from `patch(...)`) fills an attribute position;
 * - a plain value or a `Sig` fills a content position as text — a `Sig` binds
 *   reactively and any other value becomes `String(value)`.
 *
 * Templates are cached per call site, so repeated renders skip parsing. Throws
 * `E10` for an empty template, `E11:<expected>:<got>` for an interpolation-count
 * mismatch, and `E12` for an unmatched interpolation (a `patch` in content
 * position, or a text value in an attribute position).
 *
 * @param strs - the static template strings.
 * @param rawItems - the interpolated views, patches, or text values.
 * @returns the parsed `View`.
 * @example
 * ```ts
 * html`<p>Hello, ${name}!</p>`;
 * html`<button ${patch(on('click', handler))}>Go</button>`;
 * ```
 * @group Templates
 */
export const html = (
  strs: TemplateStringsArray,
  ...rawItems: HtmlItem[]
): View => {
  if (strs.length <= 1 && !strs?.[0]) err('E10');
  const slots = strs.length - 1;
  if (rawItems.length !== slots) err(`E11:${slots}:${rawItems.length}`);

  const items = rawItems.map(_toItem);

  let frag: DocumentFragment;
  const wraps: Wrap<unknown, CmdContext>[] = [];

  const shape = _shape(items);
  const exist = tplCache.get(strs);
  if (exist?.shape === shape) {
    frag = document.importNode(exist.el.content, true);
    if (items && items.length > 0) {
      _scan(
        frag,
        items,
        wraps,
        (_node, nodeIndex, itemIndex) => nodeIndex === exist.indexes[itemIndex],
      );
    }
  } else {
    const template = document.createElement('template');
    template.innerHTML = _text(strs, ...items);
    const tpl: Tpl = {el: template, indexes: [], shape};
    frag = document.importNode(template.content, true);

    if (items && items.length > 0) {
      _scan(
        frag,
        items,
        wraps,
        (node) =>
          node.nodeType === Node.ELEMENT_NODE
            ? _hasMark(node as Element)
            : node.nodeType === Node.COMMENT_NODE &&
              _isViewMark(node as Comment),
        tpl.indexes,
      );
    }

    tplCache.set(strs, tpl);
  }

  if (wraps.length !== items.length) err('E12');

  wraps.forEach(({item, node}) => {
    if (item.type === 'patch') commitPatch(item, node);
    else commitView(item, node);
  });
  const children = wraps.map((w) => w.item);
  const boundary = toBoundary(frag);

  return {
    type: 'view',
    node: frag,
    children,
    boundary: () => {
      // A view swapping its own contents changes the node at the edge, so when
      // the template begins or ends with an interpolation track that edge.
      const last = strs.length - 1;
      if (!strs[0]) {
        const first = children[0];
        if (first?.type === 'view') boundary.start = first.boundary().start;
      }
      if (!strs[last]) {
        const endChild = children[last - 1];
        if (endChild?.type === 'view') boundary.end = endChild.boundary().end;
      }
      return boundary;
    },
    cleanBinds: () => {
      children.forEach((child) => {
        child.cleanBinds();
      });
    },
  };
};

const _text = (strs: TemplateStringsArray, ...parts: (Patch | AnyView)[]) => {
  let text = strs[0] ?? '';
  for (let i = 0; i < parts.length; i++) {
    text += _toMark(at(parts, i)) + (strs[i + 1] ?? '');
  }
  return text;
};
