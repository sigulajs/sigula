import type {CmdContext} from './cmd';
import type {Commit} from './commit';
import type {Patch, PatchContext} from './patch';
import {type Bind, createBind, Sig} from './sig.bind';
import {at} from './utils';
import type {AnyView, View} from './view';

const MARK = `@sig_${Math.random().toFixed(9).slice(2)}`;

interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
  shape: string;
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
const _shape = (items: readonly (Patch | AnyView)[]): string => {
  let shape = '';
  for (const item of items) shape += item.type === 'patch' ? 'p' : 'v';
  return shape;
};

const _hasMark = (el: Element) => el.hasAttribute(MARK);
const _rmMark = (el: Element) => el.removeAttribute(MARK);
const _isView = (item: Comment) => item.data.trim() === MARK;

const commitView = <T, C extends CmdContext>(
  view: View<T, C>,
  node: Node,
): Commit<T, C> => {
  (node as Comment).replaceWith(view.node);
  return {
    binds: view.bind,
    children: view.childCommits,
  };
};

const commitPatch = (
  patch: Patch,
  node: Node,
): Commit<unknown, PatchContext> => {
  const binds: Bind<unknown, PatchContext>[] = [];
  patch.toPatchItems.forEach((toPatchItem) => {
    const item = toPatchItem(node as Element);
    if (item.source instanceof Sig) {
      item.cmd(item.source.get(), item.context);
      binds.push(createBind(item.source, item.context, item.cmd));
      // binds.push(item.source, item.context, item.cmd);
    } else {
      item.cmd(item.source, item.context);
    }
  });

  return {binds};
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

export const html = (
  strs: TemplateStringsArray,
  ...items: (Patch | AnyView)[]
): View => {
  // const frag = document.createDocumentFragment();
  const slots = strs.length - 1;
  if (items.length !== slots) {
    throw new Error(
      `html: expected ${slots} interpolation${slots === 1 ? '' : 's'}, got ${items.length}`,
    );
  }

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
            : node.nodeType === Node.COMMENT_NODE && _isView(node as Comment),
        tpl.indexes,
      );
    }

    tplCache.set(strs, tpl);
  }

  if (wraps.length !== items.length)
    throw new Error(
      'html: unmatched interpolation; patch() must be in attribute position',
    );

  const commits: Commit<unknown>[] = [];
  wraps.forEach(({item, node}) => {
    if (item.type === 'patch') {
      commits.push(commitPatch(item, node));
    } else if (item.type === 'view') {
      commits.push(commitView(item, node));
    }
  });

  return {
    type: 'view',
    node: frag,
    childCommits: commits,
  };
};

const _text = (strs: TemplateStringsArray, ...parts: (Patch | AnyView)[]) => {
  let text = strs[0] ?? '';
  for (let i = 0; i < parts.length; i++) {
    text += _toMark(at(parts, i)) + (strs[i + 1] ?? '');
  }
  return text;
};
