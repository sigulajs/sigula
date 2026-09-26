import {
  type AnySlot,
  type BaseContext,
  type Boundary,
  type Commit,
  cleanCommit,
  createBind,
  extractBoundary,
  isEqual,
  removeBoundary,
  replaceWithSlot,
  repleaceWithNode,
  type Sig,
  type Slot,
  toBoundary,
} from './common';

export type RepeatProp<T> = {
  key: (item: T) => string;
  slot: (item: T) => AnySlot;
  compare?: (a: T, b: T) => boolean;
};

export interface Container {
  parent: ParentNode;
  startFence: Node;
  endFence: Node;
}

export interface Track<T> {
  boundary: Boundary;
  item: T;
  key: string;
  childCommits?: Commit<unknown, BaseContext>[];
  checked?: boolean;
  cleaned?: boolean;
}

export interface RepeatContext<T> extends BaseContext {
  prop: RepeatProp<T>;
  boundary: Boundary;
  tracks: Track<T>[];
}

const _cleanTrack = <T>(track: Track<T>) => {
  removeBoundary(track.boundary);
  track.childCommits?.forEach((commit) => {
    cleanCommit(commit);
  });
  track.cleaned = true;
};

const repeatCmd = <T>(items: T[], ctx: RepeatContext<T>) => {
  if (!Array.isArray(items) || items.length === 0) {
    const newFrag = document.createDocumentFragment();
    newFrag.appendChild(document.createComment('empty-list'));
    const newBoundary = repleaceWithNode(ctx.boundary, newFrag);
    ctx.boundary = newBoundary;
    ctx.tracks.forEach(_cleanTrack);
    ctx.tracks = [];
    return;
  }
  const newTracks: Track<T>[] = [];
  if (!Array.isArray(ctx.tracks) || ctx.tracks.length === 0) {
    const newFrag = _init(items, ctx.prop, newTracks);
    const newBoundary = repleaceWithNode(ctx.boundary, newFrag);
    ctx.boundary = newBoundary;
    // ctx.tracks.forEach(_cleanTrack);
    ctx.tracks = newTracks;
    return;
  }

  const start = ctx.boundary.start;
  const end = ctx.boundary.end;
  const parent = start.parentNode;
  if (!parent) throw new Error('no parent node');
  const startFence = document.createComment('repeat-start-fence');
  const endFence = document.createComment('repeat-end-fence');

  parent.insertBefore(startFence, start);
  parent.insertBefore(endFence, end.nextSibling);

  const container: Container = {
    parent,
    startFence,
    endFence,
  };

  const newKeys = items.map((item) => ctx.prop.key(item));
  const oldKeys = ctx.tracks.map((track) => track.key);

  let newKeyToIndexMap: Map<unknown, number> | undefined;
  let oldKeyToIndexMap: Map<unknown, number> | undefined;

  let oldHead = 0;
  let oldTail = ctx.tracks.length - 1;
  let newHead = 0;
  let newTail = items.length - 1;

  while (oldHead <= oldTail && newHead <= newTail) {
    if (ctx.tracks[oldHead].checked) {
      oldHead++;
    } else if (ctx.tracks[oldTail].checked) {
      oldTail--;
    } else if (ctx.tracks[oldHead].key === newKeys[newHead]) {
      // old head matches new head; update in place
      newTracks[newHead] = _setTrack(
        ctx.tracks[oldHead],
        items[newHead],
        ctx.prop,
      );
      oldHead++;
      newHead++;
    } else if (ctx.tracks[oldTail].key === newKeys[newTail]) {
      // old tail matches nwe tail; update in place
      newTracks[newTail] = _setTrack(
        ctx.tracks[oldTail],
        items[newTail],
        ctx.prop,
      );
      oldTail--;
      newTail--;
    } else if (ctx.tracks[oldHead].key === newKeys[newTail]) {
      // Old head matches new tail; update and move to new tail
      newTracks[newTail] = _setTrack(
        ctx.tracks[oldHead],
        items[newTail],
        ctx.prop,
      );
      //
      // const before = ref ? boundaryStart(ref.boundary) : fence;
      // _moveTrackBefore(after, newTracks[newTail], newTracks[newTail + 1]);
      _moveTrack(
        container,
        newTracks[newTail],
        _beforeFence(container, newTracks[newTail + 1]),
      );
      oldHead++;
      newTail--;
    } else if (ctx.tracks[oldTail].key === newKeys[newHead]) {
      // old tail matches new head; update and move to new head
      newTracks[newHead] = _setTrack(
        ctx.tracks[oldTail],
        items[newHead],
        ctx.prop,
      );
      // if (!before.nextSibling) throw new Error('no before.nextSibling');
      // _moveTrackAfter(before, newTracks[newHead], newTracks[newHead - 1]);
      _moveTrack(
        container,
        newTracks[newHead],
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
        _cleanTrack(ctx.tracks[oldHead]);
        oldHead++;
      } else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
        // remove old tail
        _cleanTrack(ctx.tracks[oldTail]);
        oldTail--;
      } else {
        const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
        const oldTrack = oldIndex ? ctx.tracks[oldIndex] : null;
        if (oldTrack) {
          newTracks[newHead] = _setTrack(oldTrack, items[newHead], ctx.prop);
          // _moveTrackAfter(before, newTracks[newHead], newTracks[newHead - 1]);
          _moveTrack(
            container,
            newTracks[newHead],
            _afterFence(container, newTracks[newHead - 1]),
          );
          ctx.tracks[oldIndex as number].checked = true;
        } else {
          // create a new one and insert it
          newTracks[newHead] = _insertNewTrack(
            container,
            items[newHead],
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
      items[newHead],
      ctx.prop,
      _afterFence(container, newTracks[newHead - 1]),
    );
    newHead++;
  }

  while (oldHead <= oldTail) {
    if (!ctx.tracks[oldHead].cleaned) _cleanTrack(ctx.tracks[oldHead]);
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

const _moveTrack = <T>(container: Container, track: Track<T>, fence: Node) => {
  const parent = container.parent;
  if (track.boundary.start === track.boundary.end)
    parent.moveBefore(track.boundary.start, fence);
  else {
    let n: Node | null = track.boundary.start;
    while (n) {
      const next: Node | null = n.nextSibling;
      parent.moveBefore(n, fence);
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
  const slot = prop.slot(item);
  const boundary = extractBoundary(slot);
  container.parent.insertBefore(slot.node, fence);
  return {
    key: prop.key(item),
    boundary,
    childCommits: slot.childCommits,
    item,
  };
};

const _setTrack = <T>(
  old: Track<T>,
  item: T,
  prop: RepeatProp<T>,
): Track<T> => {
  const compare = prop.compare ?? isEqual;
  if (compare(old.item, item)) {
    return old;
  }

  const slot = prop.slot(item);
  const newBoundary = replaceWithSlot(old.boundary, slot);
  _cleanTrack(old);

  const newTrack: Track<T> = {
    key: prop.key(item),
    boundary: newBoundary,
    childCommits: slot.childCommits,
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
    const slot = prop.slot(item);
    const key = prop.key(item);

    const boundary = extractBoundary(slot);
    tracks.push({key, boundary, item, childCommits: slot.childCommits});
    frag.appendChild(slot.node);
  });

  if (frag.childNodes.length === 0) {
    frag.appendChild(document.createComment('empty-list'));
  }
  return frag;
};

export const repeat = <T>(
  sig: Sig<T[]>,
  prop: RepeatProp<T>,
): Slot<T[], RepeatContext<T>> => {
  const tracks: Track<T>[] = [];
  const frag = _init(sig.get(), prop, tracks);

  const ctx: RepeatContext<T> = {prop, tracks, boundary: toBoundary(frag)};
  const bind = createBind(sig, ctx, repeatCmd);

  return {
    type: 'slot',
    node: frag,
    bind,
  };
};
