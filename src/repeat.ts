import {
  type AnyView,
  at,
  type Boundary,
  type CmdContext,
  createBind,
  eq,
  err,
  removeBind,
  removeBoundary,
  replaceWithNode,
  replaceWithView,
  type Sig,
  toBoundary,
  type View,
  walkBoundary,
} from './core';

/**
 * Options for {@link repeat}.
 *
 * @typeParam T - the item type.
 * @group Control flow
 */
export type RepeatProp<T> = {
  /** Returns the unique, stable key for an item. */
  key: (item: T) => string;
  /** Builds the view for an item. */
  view: (item: T) => AnyView;
  /** Item comparator; defaults to `eq`. */
  eq?: (a: T, b: T) => boolean;
};

interface Container {
  parent: ParentNode;
  startFence: Node;
  endFence: Node;
}

interface Track<T> {
  key: string;
  item: T;
  view: AnyView;
  checked?: boolean;
  cleaned?: boolean;
}

/**
 * Context for the `repeat` command.
 *
 * @typeParam T - the item type.
 * @group Control flow
 */
export interface RepeatContext<T> extends CmdContext {
  /** The repeat options. */
  prop: RepeatProp<T>;
  /** The current node boundary. */
  boundary: Boundary;
  /** The tracked items and their views. */
  tracks: Track<T>[];
}

const _cleanTrack = <T>(track: Track<T>) => {
  removeBoundary(track.view.boundary());
  track.view.cleanBinds();
  track.cleaned = true;
};

const repeatCmd = <T>(items: T[], ctx: RepeatContext<T>) => {
  if (!Array.isArray(items) || items.length === 0) {
    const newFrag = document.createDocumentFragment();
    newFrag.appendChild(document.createComment('empty-list'));
    const newBoundary = replaceWithNode(ctx.boundary, newFrag);
    ctx.boundary = newBoundary;
    ctx.tracks.forEach(_cleanTrack);
    ctx.tracks = [];
    return;
  }
  const newTracks: Track<T>[] = [];
  if (!Array.isArray(ctx.tracks) || ctx.tracks.length === 0) {
    const newFrag = _init(items, ctx.prop, newTracks);
    const newBoundary = replaceWithNode(ctx.boundary, newFrag);
    ctx.boundary = newBoundary;
    ctx.tracks = newTracks;
    return;
  }

  const start = ctx.boundary.start;
  const end = ctx.boundary.end;
  const parent = start.parentNode;
  if (!parent) err('E7');

  const compare = ctx.prop.eq ?? eq;
  const newKeys = items.map((item) => ctx.prop.key(item));
  const tracks = ctx.tracks;

  // Nothing changed: same keys, same order, equal items. Bail out before
  // touching the DOM so a redundant re-render costs zero DOM mutations
  // instead of a fence insert/remove pair.
  if (tracks.length === items.length) {
    const unchanged = tracks.every((track, i) => {
      const item = items[i] as T;
      return track.key === newKeys[i] && compare(track.item, item);
    });
    if (unchanged) return;
  }

  const startFence = document.createComment('repeat-start-fence');
  const endFence = document.createComment('repeat-end-fence');

  parent.insertBefore(startFence, start);
  parent.insertBefore(endFence, end.nextSibling);

  const container: Container = {
    parent,
    startFence,
    endFence,
  };

  const oldKeys = tracks.map((track) => track.key);

  let newKeyToIndexMap: Map<unknown, number> | undefined;
  let oldKeyToIndexMap: Map<unknown, number> | undefined;

  let oldHead = 0;
  let oldTail = ctx.tracks.length - 1;
  let newHead = 0;
  let newTail = items.length - 1;

  while (oldHead <= oldTail && newHead <= newTail) {
    if (ctx.tracks[oldHead]?.checked) {
      oldHead++;
    } else if (ctx.tracks[oldTail]?.checked) {
      oldTail--;
    } else if (ctx.tracks[oldHead]?.key === newKeys[newHead]) {
      // old head matches new head; update in place
      newTracks[newHead] = _setTrack(
        at(ctx.tracks, oldHead),
        at(items, newHead),
        ctx.prop,
        compare,
      );
      oldHead++;
      newHead++;
    } else if (ctx.tracks[oldTail]?.key === newKeys[newTail]) {
      // old tail matches new tail; update in place
      newTracks[newTail] = _setTrack(
        at(ctx.tracks, oldTail),
        at(items, newTail),
        ctx.prop,
        compare,
      );
      oldTail--;
      newTail--;
    } else if (ctx.tracks[oldHead]?.key === newKeys[newTail]) {
      // old head matches new tail; update and move to new tail
      newTracks[newTail] = _setTrack(
        at(ctx.tracks, oldHead),
        at(items, newTail),
        ctx.prop,
        compare,
      );
      _moveTrack(
        container,
        at(newTracks, newTail),
        _beforeFence(container, newTracks[newTail + 1]),
      );
      oldHead++;
      newTail--;
    } else if (ctx.tracks[oldTail]?.key === newKeys[newHead]) {
      // old tail matches new head; update and move to new head
      newTracks[newHead] = _setTrack(
        at(ctx.tracks, oldTail),
        at(items, newHead),
        ctx.prop,
        compare,
      );
      _moveTrack(
        container,
        at(newTracks, newHead),
        _afterFence(container, newTracks[newHead - 1]),
      );
      oldTail--;
      newHead++;
    } else {
      if (newKeyToIndexMap === undefined || oldKeyToIndexMap === undefined) {
        newKeyToIndexMap = _generateMap(newKeys, newHead, newTail);
        oldKeyToIndexMap = _generateMap(oldKeys, oldHead, oldTail);
      }
      if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
        _cleanTrack(at(ctx.tracks, oldHead));
        oldHead++;
      } else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
        _cleanTrack(at(ctx.tracks, oldTail));
        oldTail--;
      } else {
        const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
        const oldTrack = oldIndex !== undefined ? ctx.tracks[oldIndex] : null;
        if (oldTrack) {
          newTracks[newHead] = _setTrack(
            oldTrack,
            at(items, newHead),
            ctx.prop,
            compare,
          );
          _moveTrack(
            container,
            at(newTracks, newHead),
            _afterFence(container, newTracks[newHead - 1]),
          );
          oldTrack.checked = true;
        } else {
          newTracks[newHead] = _insertNewTrack(
            container,
            at(items, newHead),
            ctx.prop,
            _afterFence(container, newTracks[newHead - 1]),
          );
        }
        newHead++;
      }
    }
  }

  while (newHead <= newTail) {
    newTracks[newHead] = _insertNewTrack(
      container,
      at(items, newHead),
      ctx.prop,
      _afterFence(container, newTracks[newHead - 1]),
    );
    newHead++;
  }

  while (oldHead <= oldTail) {
    if (!ctx.tracks[oldHead]?.cleaned && !ctx.tracks[oldHead]?.checked)
      _cleanTrack(at(ctx.tracks, oldHead));
    oldHead++;
  }

  if (!container.startFence.nextSibling || !container.endFence.previousSibling)
    err('E8');

  ctx.boundary = {
    start: container.startFence.nextSibling,
    end: container.endFence.previousSibling,
  };
  container.parent.removeChild(container.startFence);
  container.parent.removeChild(container.endFence);
  ctx.tracks = newTracks;
};

const _generateMap = (list: unknown[], start: number, end: number) => {
  const map = new Map<unknown, number>();
  for (let i = start; i <= end; i++) {
    map.set(list[i], i);
  }
  return map;
};

const _beforeFence = <T>(container: Container, track?: Track<T>): Node =>
  track ? track.view.boundary().start : container.endFence;
const _afterFence = <T>(container: Container, track?: Track<T>): Node => {
  const node = track ? track.view.boundary().end : container.startFence;
  if (!node.nextSibling) err('E9');
  return node.nextSibling;
};

const _mvNodeBefore = (parent: ParentNode, node: Node, child: Node | null) => {
  if (parent.moveBefore) parent.moveBefore(node, child);
  else parent.insertBefore(node, child);
};

const _moveTrack = <T>(container: Container, track: Track<T>, fence: Node) => {
  const parent = container.parent;
  walkBoundary(track.view.boundary(), (node) =>
    _mvNodeBefore(parent, node, fence),
  );
};

const _insertNewTrack = <T>(
  container: Container,
  item: T,
  prop: RepeatProp<T>,
  fence: Node,
): Track<T> => {
  const view = prop.view(item);
  container.parent.insertBefore(view.node, fence);
  return {
    key: prop.key(item),
    item,
    view,
  };
};

const _setTrack = <T>(
  old: Track<T>,
  item: T,
  prop: RepeatProp<T>,
  compare: (a: T, b: T) => boolean,
): Track<T> => {
  if (compare(old.item, item)) {
    return {
      ...old,
      checked: false,
      cleaned: false,
    };
  }

  const oldBoundary = old.view.boundary();
  const view = prop.view(item);
  replaceWithView(oldBoundary, view);
  _cleanTrack(old);

  const newTrack: Track<T> = {
    key: prop.key(item),
    item,
    view,
  };

  return newTrack;
};

const _init = <T>(
  items: T[],
  prop: RepeatProp<T>,
  tracks: Track<T>[],
): DocumentFragment => {
  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const view = prop.view(item);
    const key = prop.key(item);

    tracks.push({
      key,
      item,
      view,
    });
    frag.appendChild(view.node);
  });

  if (frag.childNodes.length === 0) {
    frag.appendChild(document.createComment('empty-list'));
  }
  return frag;
};

/**
 * Keyed list rendering. On each change `repeat` matches items by `key`, then
 * reuses, moves, creates, or removes as few DOM nodes as possible. The item
 * comparator defaults to `eq`; when an item is deeply equal to the track it
 * already occupies, the track is reused without rebuilding its view. An empty
 * array renders `<!--empty-list-->`.
 *
 * @typeParam T - the item type.
 * @param sig - the signal holding the items.
 * @param prop - the key/view/eq options.
 * @returns a `View` rendering the list.
 * @example
 * ```ts
 * html`<ul>${repeat(todos, {
 *   key: (item) => item.id.toString(),
 *   view: (item) => html`<li>${text(item.label)}</li>`,
 * })}</ul>`;
 * ```
 * @group Control flow
 */
export const repeat = <T>(
  sig: Sig<T[]>,
  prop: RepeatProp<T>,
): View<T[], RepeatContext<T>> => {
  const tracks: Track<T>[] = [];
  const frag = _init(sig.get(), prop, tracks);

  const ctx: RepeatContext<T> = {prop, tracks, boundary: toBoundary(frag)};
  const bind = createBind(sig, ctx, repeatCmd);

  return {
    type: 'view',
    node: frag,
    bind,
    boundary: () => ctx.boundary,
    cleanBinds: () => {
      removeBind(bind);
      ctx.tracks.forEach((t) => {
        t.view.cleanBinds();
      });
    },
  };
};
