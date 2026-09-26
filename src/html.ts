import {
  type AnySlot,
  type BaseContext,
  type Commit,
  commitPatch,
  commitSlot,
  type Patch,
  type Slot,
} from './common';

export const MARK = `@sig_${Math.random().toFixed(9).slice(2)}`;

interface Tpl {
  el: HTMLTemplateElement;
  indexes: number[];
}

interface Wrap<T, C extends BaseContext> {
  item: Patch | Slot<T, C>;
  node: Node;
}

const tplCache = new WeakMap<TemplateStringsArray, Tpl>();
const walker = document.createTreeWalker(
  document,
  NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
);

const _toMark = (item: Patch | AnySlot): string =>
  item.type === 'patch' ? MARK : `<!--${MARK}-->`;

const _hasMark = (el: Element) => el.hasAttribute(MARK);
const _removeMark = (el: Element) => el.removeAttribute(MARK);
const _isSlot = (item: Comment) => item.data.trim() === MARK;

export const html = (
  strs: TemplateStringsArray,
  ...items: (Patch | AnySlot)[]
): AnySlot => {
  // const frag = document.createDocumentFragment();
  let frag: DocumentFragment;
  const itemCount = strs.length - 1;
  const wraps: Wrap<unknown, BaseContext>[] = [];

  const exist = tplCache.get(strs);
  if (exist) {
    frag = document.importNode(exist.el.content, true);
    if (items && items.length > 0) {
      walker.currentNode = frag;

      let node = walker.nextNode();

      let nodeIndex = 0;
      let itemIndex = 0;
      let existIndex = exist.indexes[itemIndex];
      while (existIndex !== undefined) {
        if (nodeIndex === existIndex) {
          if (node === null) throw new Error('empty node');
          wraps.push({item: items[itemIndex], node});
          itemIndex++;
          existIndex = exist.indexes[itemIndex];
          if (node.nodeType === Node.ELEMENT_NODE) _removeMark(node as Element);
        }
        node = walker.nextNode();
        nodeIndex++;
      }

      // https://github.com/lit/lit/blob/c42ee1e96b8fd61f7256f61d715daef572e76e52/packages/lit-html/src/lit-html.ts#L1260
      // We need to set the currentNode away from the cloned tree so that we
      // don't hold onto the tree even if the tree is detached and should be
      // freed.
      walker.currentNode = document;
    }
  } else {
    const template = document.createElement('template');
    template.innerHTML = _text(strs, ...items);
    const tpl: Tpl = {el: template, indexes: []};
    frag = document.importNode(template.content, true);

    if (items && items.length > 0) {
      walker.currentNode = frag;
      let nodeIndex = 0;
      let node = walker.nextNode();

      while (node !== null && tpl.indexes.length < itemCount) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (_hasMark(node as Element)) {
            tpl.indexes.push(nodeIndex);
            wraps.push({item: items[wraps.length], node});
            _removeMark(node as Element);
          }
        } else if (node.nodeType === Node.COMMENT_NODE) {
          if (_isSlot(node as Comment)) {
            tpl.indexes.push(nodeIndex);
            wraps.push({item: items[wraps.length], node});
          }
        }
        //

        node = walker.nextNode();
        nodeIndex++;
        walker.currentNode = document;
      }
    }

    tplCache.set(strs, tpl);
  }

  const commits: Commit<unknown, BaseContext>[] = [];
  wraps.forEach(({item, node}) => {
    if (item.type === 'patch') {
      commits.push(
        commitPatch(item, node) as unknown as Commit<unknown, BaseContext>,
      );
    } else if (item.type === 'slot') {
      commits.push(commitSlot(item, node));
    }
  });

  return {
    type: 'slot',
    node: frag,
    childCommits: commits,
  };
};

const _text = (strs: TemplateStringsArray, ...parts: (Patch | AnySlot)[]) => {
  let text = strs[0] ?? '';
  for (let i = 0; i < parts.length; i++) {
    text += _toMark(parts[i]) + (strs[i + 1] ?? '');
  }
  return text;
};
