/*
 * Sig
 *   - val: T
 *   - binds: Bind[]
 */
export class Sig<T> {
  private _val: T;
  private _binds: Bind<T, BaseContext>[] = [];

  constructor(val: T) {
    this._val = val;
  }

  get(): T {
    return this._val;
  }

  forceUpdate(v: T) {
    this._val = v;
    queueMicrotask(() => {
      for (const {removed, cmd, context} of this._binds) {
        if (!removed) cmd(this._val, context);
      }
    });
  }

  update(v: T) {
    if (isEqual(v, this._val)) return;
    this.forceUpdate(v);
  }

  addBind<C extends BaseContext>(bind: Bind<T, C>) {
    this._binds.push(bind as unknown as Bind<T, BaseContext>);
  }

  removeBind(bind: Bind<T, BaseContext>) {
    const index = this._binds.indexOf(bind);
    this._binds.splice(index, 1);
    if (this._binds.length === 0) {
      this.cleanup();
    }
  }

  cleanup() {}
}

export const createSig = <T>(v: T) => new Sig(v);

export const isEqual = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (a === null || b === null || typeof a !== 'object') return false;

  // may let Array always return false
  // if (Array.isArray(a) || Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Date
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();

  // RegExp
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      if (!b.has(key) || !isEqual(val, b.get(key))) return false;
    }
    return true;
  }

  // Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const arrA = Array.from(a);
    const arrB = Array.from(b);
    return isEqual(arrA, arrB);
  }

  // Object & Record
  if (Object.is(a, b)) return true;
  if (!isRecord(a) || !isRecord(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
};

export type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null;

/*
 * Component
 */
// export interface Component {
//   type: 'component';
//   bind?: Bind;
// }

export interface Boundary {
  start: Node;
  end: Node;
}

export const removeBoundary = (b: Boundary) => {
  if (b.start === b.end) b.start.parentNode?.removeChild(b.start);
  else {
    const range = document.createRange();
    range.setStartBefore(b.start);
    range.setEndAfter(b.end);
    range.deleteContents();
  }
};
/*
 * Context
 *   1. html element (with extra args)
 *   2. component
 *   3. keyed components
 *   4. derived
 */
export interface BaseContext {
  [key: string]: unknown;
}

// export interface BoundaryContext<T> extends BaseContext {
//   kind: 'boundary';
//   boundary: Boundary;
//   slotFn: (val: T) => Slot;
// }

// export interface DerivedContext extends BaseContext {
//   // kind: 'derived';
//   derived: Sig<unknown>;
// }

// export interface KeyedContext extends BaseContext {
//   // kind: 'keyed';
//   keyed: Map<string, Slot>;
// }

// export type AvailableContext =
//   | ElemContext
//   | BoundaryContext
//   | DerivedContext
//   | KeyedContext;

/*
 * Bind: sig - context - cmd
 */
export interface Bind<T, C extends BaseContext> {
  sig: Sig<T>;
  context: C;
  cmd: Cmd<T, C>;
  removed: boolean;
}

export const removeBind = (bind: Bind<unknown, BaseContext>) => {
  bind.removed = true;
  bind.sig.removeBind(bind);
};

export type AnyBind = Bind<unknown, BaseContext>;

export const createBind = <T, C extends BaseContext>(
  sig: Sig<T>,
  context: C,
  cmd: Cmd<T, C>,
): Bind<T, C> => {
  const bind: Bind<T, C> = {sig, context, cmd, removed: false};
  sig.addBind(bind);
  return bind;
};

/*
 * Cmd: (val, context) => void
 */
export type Cmd<T, C extends BaseContext> = (val: T, context: C) => void;
export type AnyCmd = Cmd<unknown, BaseContext>;

export interface PatchContext extends BaseContext {
  // kind: 'elem';
  node: Node;
  extra?: unknown[];
}

export interface PatchItem<T> {
  source: T | Sig<T>;
  context: PatchContext;
  cmd: Cmd<T, PatchContext>;
}

export type ToPatchItem<T> = (el: Element) => PatchItem<T>;

export interface Patch {
  type: 'patch';
  toPatchItems: ToPatchItem<unknown>[];
}

export interface Slot<T, C extends BaseContext> {
  type: 'slot';
  // frag: DocumentFragment;
  node: Node;
  bind?: Bind<T, C>;
  childCommits?: Commit<unknown, BaseContext>[];
}

export type AnySlot = Slot<unknown, BaseContext>;

// export interface TextSlot<T> {
//   type: 'text';
//   text: Text;
//   bind?: Bind<T, PatchContext>;
// }

// export interface BindSlot<T, C extends BaseContext> extends Slot {
//   bind: Bind<T, C>;
// }

// export const isBindSlot = <T, C extends BaseContext>(
//   slot: Slot,
// ): slot is BindSlot<T, C> => 'bind' in slot;

export interface Commit<T, C extends BaseContext> {
  binds?: Bind<T, C> | Bind<T, C>[];
  children?: Commit<unknown, BaseContext>[];
}

export const cleanCommit = (commit: Commit<unknown, BaseContext>) => {
  if (commit.binds) {
    if (Array.isArray(commit.binds)) {
      commit.binds.forEach((bind) => {
        removeBind(bind);
      });
    } else {
      removeBind(commit.binds);
    }
  }
  commit.children?.forEach((child) => {
    cleanCommit(child);
  });
};

export const commitPatch = (
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

// export const commitTextSlot = (
//   textSlot: TextSlot<unknown>,
//   node: Node,
// ): Commit<unknown, PatchContext> => {
//   (node as Comment).replaceWith(textSlot.text);
//   const binds = textSlot.bind ? [textSlot.bind] : [];
//   return {binds};
// };

export const commitSlot = <T, C extends BaseContext>(
  slot: Slot<T, C>,
  node: Node,
): Commit<T, C> => {
  (node as Comment).replaceWith(slot.node);
  return {
    binds: slot.bind,
    children: slot.childCommits,
  };
};

export const toBoundary = (node: Node): Boundary => {
  const b =
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? {start: node.firstChild, end: node.lastChild}
      : {start: node, end: node};
  if (!b.start || !b.end) throw new Error('toBoundary: empty fragment');
  return b as Boundary;
};

export const extractBoundary = (slot: AnySlot): Boundary =>
  toBoundary(slot.node);

export const repleaceWithNode = (old: Boundary, node: Node) => {
  const newBoundary = toBoundary(node);
  if (old.start === old.end) {
    old.start.parentNode?.replaceChild(node, old.start);
  } else {
    const doc = old.start.ownerDocument ?? document;
    const range = doc.createRange();
    range.setStartBefore(old.start);
    range.setEndAfter(old.end);
    range.deleteContents();
    range.insertNode(node);
  }
  return newBoundary;
};

export const replaceWithSlot = (old: Boundary, slot: AnySlot): Boundary => {
  return repleaceWithNode(old, slot.node);
  // const newBoundary = extractBoundary(slot);

  // if (old.start === old.end) {
  //   old.start.parentNode?.replaceChild(slot.node, old.start);
  // } else {
  //   const doc = old.start.ownerDocument ?? document;
  //   const range = doc.createRange();
  //   range.setStartBefore(old.start);
  //   range.setEndAfter(old.end);
  //   range.deleteContents();
  //   range.insertNode(slot.node);
  // }
  // return newBoundary;
};

export interface SigRecord {
  [key: string]: Sig<unknown>;
}

export type ValRecord<K extends SigRecord> = {
  [P in keyof K]: K[P] extends Sig<infer U> ? U : never;
};

export const toValRecord = <S extends SigRecord>(source: S): ValRecord<S> => {
  const keys = Object.keys(source);
  const vals: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    vals[k] = source[k].get();
  }
  return vals as ValRecord<S>;
};

export interface ComputeContext<S, T> extends BaseContext {
  // source: Sig<S>;
  target: Sig<T>;
  fn: (s: S) => T;
}

export class DerivedSig<T> extends Sig<T> {
  private _fromBinds: Bind<unknown, BaseContext>[] = [];

  addFromBind<S, C extends BaseContext>(bind: Bind<S, C>) {
    this._fromBinds.push(bind as unknown as Bind<unknown, BaseContext>);
  }

  cleanup() {
    this._fromBinds.forEach((bind) => {
      removeBind(bind);
    });
  }
}

const computeCmd = <S, T>(s: S, ctx: ComputeContext<S, T>) => {
  const res = ctx.fn(s);
  ctx.target.update(res);
};

export const compute = <S, T>(
  source: Sig<S>,
  fn: (v: S) => T,
): DerivedSig<T> => {
  const output = fn(source.get());
  const target = new DerivedSig(output);
  const ctx: ComputeContext<S, T> = {target, fn};
  const bind = createBind(source, ctx, computeCmd);
  target.addFromBind(bind);
  return target;
};

export interface ComputeRecordContext<S extends SigRecord, T>
  extends BaseContext {
  source: S;
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
}

export const computeRecord = <S extends SigRecord, T>(
  source: S,
  fn: (v: ValRecord<S>) => T,
): DerivedSig<T> => {
  const vals = toValRecord(source);
  const res = fn(vals);
  const target = new DerivedSig(res);

  const ctx: ComputeRecordContext<S, T> = {source, target, fn};

  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const bind = createBind(source[k], ctx, computeRecordCmd);
    target.addFromBind(bind);
  }

  return target;
};

const computeRecordCmd = <S extends SigRecord, T>(
  _s: unknown,
  ctx: ComputeRecordContext<S, T>,
) => {
  const vals = toValRecord(ctx.source);
  const res = ctx.fn(vals);
  ctx.target.update(res);
};
