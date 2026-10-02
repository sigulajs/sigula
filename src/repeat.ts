import {
  type Boundary,
  removeBoundary,
  replaceWithNode,
  toBoundary,
} from './boundary';
import type {CmdContext} from './cmd';
import {type Commit, cleanCommit} from './commit';
import {isEqual} from './eq';
import {type AnyBind, createBind, removeBind, type Sig} from './sig.bind';
import {at} from './utils';
import {
  type AnyView,
  extractBoundary,
  replaceWithView,
  type View,
} from './view';

export type RepeatProp<T> = {
  key: (item: T) => string;
  view: (item: T) => AnyView;
  compare?: (a: T, b: T) => boolean;
};

export interface Container {
  parent: ParentNode;
  startFence: Node;
  endFence: Node;
}

export interface Track<T> {
  boundary: Boundary;
  bind?: AnyBind | undefined;
  item: T;
  key: string;
  childCommits?: Commit<unknown, CmdContext>[] | undefined;
  checked?: boolean;
  cleaned?: boolean;
}

export interface RepeatContext<T> extends CmdContext {
  prop: RepeatProp<T>;
  boundary: Boundary;
  tracks: Track<T>[];
}

const _cleanTrack = <T>(track: Track<T>) => {
  removeBoundary(track.boundary);
  if (track.bind) removeBind(track.bind);
  track.childCommits?.forEach((commit) => {
    cleanCommit(commit);
  });
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
    // ctx.tracks.forEach(_cleanTrack);
    ctx.tracks = newTracks;
    return;
  }

  const start = ctx.boundary.start;
  const end = ctx.boundary.end;
  const parent = start.parentNode;
  if (!parent) throw new Error('no parent node');

  const compare = ctx.prop.compare ?? isEqual;
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
      // console.log('skip old head', ctx.tracks[oldHead].key);

      oldHead++;
    } else if (ctx.tracks[oldTail]?.checked) {
      // console.log('skip old tail', ctx.tracks[oldTail].key);

      oldTail--;
    } else if (ctx.tracks[oldHead]?.key === newKeys[newHead]) {
      // old head matches new head; update in place
      // console.log('matches head', newKeys[newHead]);

      newTracks[newHead] = _setTrack(
        at(ctx.tracks, oldHead),
        at(items, newHead),
        ctx.prop,
        compare,
      );
      oldHead++;
      newHead++;
    } else if (ctx.tracks[oldTail]?.key === newKeys[newTail]) {
      // old tail matches nwe tail; update in place
      // console.log('matches tail', newKeys[newTail]);

      newTracks[newTail] = _setTrack(
        at(ctx.tracks, oldTail),
        at(items, newTail),
        ctx.prop,
        compare,
      );
      oldTail--;
      newTail--;
    } else if (ctx.tracks[oldHead]?.key === newKeys[newTail]) {
      // Old head matches new tail; update and move to new tail
      // console.log(
      //   'Old head matches new tail',
      //   ctx.tracks[oldHead].key,
      //   newKeys[newTail],
      // );
      newTracks[newTail] = _setTrack(
        at(ctx.tracks, oldHead),
        at(items, newTail),
        ctx.prop,
        compare,
      );
      //
      // const before = ref ? boundaryStart(ref.boundary) : fence;
      // _moveTrackBefore(after, newTracks[newTail], newTracks[newTail + 1]);
      _moveTrack(
        container,
        at(newTracks, newTail),
        _beforeFence(container, newTracks[newTail + 1]),
      );
      oldHead++;
      newTail--;
    } else if (ctx.tracks[oldTail]?.key === newKeys[newHead]) {
      // old tail matches new head; update and move to new head
      // console.log(
      //   'old tail matches new head',
      //   ctx.tracks[oldTail].key,
      //   newKeys[newHead],
      // );

      newTracks[newHead] = _setTrack(
        at(ctx.tracks, oldTail),
        at(items, newHead),
        ctx.prop,
        compare,
      );
      // if (!before.nextSibling) throw new Error('no before.nextSibling');
      // _moveTrackAfter(before, newTracks[newHead], newTracks[newHead - 1]);
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
        // remove old head
        // console.log('remove old head', ctx.tracks[oldHead].key);
        _cleanTrack(at(ctx.tracks, oldHead));
        oldHead++;
      } else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
        // remove old tail
        // console.log('remove old tail', ctx.tracks[oldTail].key);
        _cleanTrack(at(ctx.tracks, oldTail));
        oldTail--;
      } else {
        const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
        const oldTrack = oldIndex !== undefined ? ctx.tracks[oldIndex] : null;
        if (oldTrack) {
          // console.log(
          //   'move old item to new head:',
          //   oldTrack.key,
          //   newKeys[newHead],
          // );
          newTracks[newHead] = _setTrack(
            oldTrack,
            at(items, newHead),
            ctx.prop,
            compare,
          );
          // _moveTrackAfter(before, newTracks[newHead], newTracks[newHead - 1]);
          _moveTrack(
            container,
            at(newTracks, newHead),
            _afterFence(container, newTracks[newHead - 1]),
          );
          oldTrack.checked = true;
          // ctx.tracks[oldIndex as number].checked = true;
        } else {
          // create a new one and insert it
          // console.log('create new item:', newKeys[newHead]);
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
    // console.log('create new head:', newKeys[newHead]);
    newTracks[newHead] = _insertNewTrack(
      container,
      at(items, newHead),
      ctx.prop,
      _afterFence(container, newTracks[newHead - 1]),
    );
    newHead++;
  }

  while (oldHead <= oldTail) {
    // console.log('remove old head:', ctx.tracks[oldHead].key);
    if (!ctx.tracks[oldHead]?.cleaned && !ctx.tracks[oldHead]?.checked)
      _cleanTrack(at(ctx.tracks, oldHead));
    oldHead++;
  }

  if (!container.startFence.nextSibling || !container.endFence.previousSibling)
    throw new Error('error container fences');

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
  track ? track.boundary.start : container.endFence;
const _afterFence = <T>(container: Container, track?: Track<T>): Node => {
  const node = track ? track.boundary.end : container.startFence;
  if (!node.nextSibling) throw new Error('no after fence');
  return node.nextSibling;
};

const _mvNodeBefore = (parent: ParentNode, node: Node, child: Node | null) => {
  if (parent.moveBefore) parent.moveBefore(node, child);
  else parent.insertBefore(node, child);
};

const _moveTrack = <T>(container: Container, track: Track<T>, fence: Node) => {
  const parent = container.parent;

  if (track.boundary.start === track.boundary.end)
    _mvNodeBefore(parent, track.boundary.start, fence);
  else {
    let n: Node | null = track.boundary.start;
    while (n) {
      const next: Node | null = n.nextSibling;
      _mvNodeBefore(parent, n, fence);
      if (n === track.boundary.end) break;
      n = next;
    }
  }
};

const _insertNewTrack = <T>(
  container: Container,
  item: T,
  prop: RepeatProp<T>,
  fence: Node,
): Track<T> => {
  const view = prop.view(item);
  const boundary = extractBoundary(view);
  container.parent.insertBefore(view.node, fence);
  return {
    key: prop.key(item),
    boundary,
    bind: view.bind,
    childCommits: view.childCommits,
    item,
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

  const view = prop.view(item);
  const newBoundary = replaceWithView(old.boundary, view);
  _cleanTrack(old);

  const newTrack: Track<T> = {
    key: prop.key(item),
    boundary: newBoundary,
    bind: view.bind,
    childCommits: view.childCommits,
    item,
  };

  return newTrack;
};

export const _init = <T>(
  items: T[],
  prop: RepeatProp<T>,
  tracks: Track<T>[],
): DocumentFragment => {
  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const view = prop.view(item);
    const key = prop.key(item);

    const boundary = extractBoundary(view);
    tracks.push({
      key,
      boundary,
      bind: view.bind,
      item,
      childCommits: view.childCommits,
    });
    frag.appendChild(view.node);
  });

  if (frag.childNodes.length === 0) {
    frag.appendChild(document.createComment('empty-list'));
  }
  return frag;
};

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
  };
};
