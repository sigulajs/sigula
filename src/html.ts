import type {CmdContext} from './cmd';
import type {Commit} from './commit';
import type {Patch, PatchContext} from './patch';
import {type Bind, createBind, Sig} from './sig.bind';
import {at} from './utils';
import type {AnyView, View} from './view';

export const MARK = `@sig_${Math.random().toFixed(9).slice(2)}`;

interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
}

interface Wrap<T, C extends CmdContext> {
  item: Patch | View<T, C>;
  node: Node;
}

const tplCache = new WeakMap<TemplateStringsArray, Tpl>();
const walker = document.createTreeWalker(
  document,
  NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
);

const _toMark = (item: Patch | View): string =>
  item.type === 'patch' ? MARK : `<!--${MARK}-->`;

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
  walker.currentNode = frag;
  let node = walker.nextNode();
  let nodeIndex = 0;
  let itemIndex = 0;
  while (node !== null && itemIndex < items.length) {
    if (hit(node, nodeIndex, itemIndex)) {
      wraps.push({item: at(items, itemIndex), node});
      if (indexes) indexes.push(nodeIndex);
      itemIndex++;
      if (node.nodeType === Node.ELEMENT_NODE) _rmMark(node as Element);
    }
    node = walker.nextNode();
    nodeIndex++;
  }
  // https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/lit-html.ts#L1260
  // We need to set the currentNode away from the cloned tree so that we
  // don't hold onto the tree even if it is detached and should be freed.
  walker.currentNode = document;
};

export const html = (
  strs: TemplateStringsArray,
  ...items: (Patch | AnyView)[]
): View => {
  // const frag = document.createDocumentFragment();
  let frag: DocumentFragment;
  const wraps: Wrap<unknown, CmdContext>[] = [];

  const exist = tplCache.get(strs);
  if (exist) {
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
    const tpl: Tpl = {el: template, indexes: []};
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

  const commits: Commit<unknown, CmdContext>[] = [];
  wraps.forEach(({item, node}) => {
    if (item.type === 'patch') {
      commits.push(
        commitPatch(item, node) as unknown as Commit<unknown, CmdContext>,
      );
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
