import type {Cmd, CmdContext} from './cmd';
import {type Eq, type Equatable, eq} from './eq';

/**
 * A registered binding: the signal, its command context, and the command that
 * runs when the signal changes.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @group Reactivity
 */
export interface Bind<T, C extends CmdContext> {
  /** The signal this binding observes. */
  sig: Sig<T>;
  /** The context passed to `cmd` on each run. */
  context: C;
  /** The command run with the current value and context. */
  cmd: Cmd<T, C>;
  /** Set when the binding is detached; a removed binding is skipped. */
  removed: boolean;
  /** Queue flag; true while the binding is queued for the next flush. */
  queued?: boolean;
  /**
   * Group flag. Binds that share a group (the source binds of one `compute`
   * record) are enqueued at most once per flush.
   */
  group?: {queued: boolean};
}

/**
 * A {@link Bind} with erased value and context types.
 *
 * @group Reactivity
 */
// biome-ignore lint/suspicious/noExplicitAny: any bind
export type AnyBind = Bind<any, any>;

// Module singleton, kept as plain state and functions rather than a class
// instance so the minifier can rename the state and helpers.
const queue: AnyBind[] = [];
let head = 0;
let running = false;
let scheduled = false;

// Upper bound on the tasks one flush may run, so a divergent update loop cannot
// hang the microtask. Far above any realistic single flush; a runaway stops
// after roughly this many tasks instead of looping forever.
const MAX_FLUSH = 1_000_000;

const enqueue = (binds: readonly AnyBind[]): void => {
  for (const bind of binds) {
    if (bind.queued) continue;
    const group = bind.group;
    if (group) {
      if (group.queued) continue;
      group.queued = true;
    }
    bind.queued = true;
    queue.push(bind);
  }
  if (queue.length > head) kick();
};

const kick = (): void => {
  if (running || scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    running = true;
    scheduled = false;
    flush();
  });
};

const flush = (): void => {
  running = true;
  let tasks = 0;
  try {
    while (head < queue.length) {
      if (++tasks > MAX_FLUSH) break;
      const bind = queue[head++] as AnyBind;
      const group = bind.group;
      if (group) group.queued = false;
      try {
        const {removed, sig, context, cmd} = bind;
        if (!removed) cmd(sig.get(), context);
      } catch (err) {
        console.error('[Queue] task failed:', err, bind);
      } finally {
        // re-arm after running: cmd reads sig.get() at call time, so a bind
        // that runs after a write already sees the newest value and must
        // not re-run, while one that ran before it has to be queued again
        bind.queued = false;
      }
    }
  } finally {
    running = false;
    if (head < queue.length) {
      // Cap hit: release the tasks we did not run so a later write can
      // re-enqueue them, then report once.
      for (let i = head; i < queue.length; i++) {
        const b = queue[i] as AnyBind;
        b.queued = false;
        if (b.group) b.group.queued = false;
      }
      console.error(`[Queue] flush exceeded ${MAX_FLUSH} tasks`);
    }
    queue.length = 0;
    head = 0;
  }
};

/**
 * The core reactive value. A `Sig` holds a value and a set of bindings that run
 * when it changes; writes are queued and coalesced in a microtask.
 *
 * @typeParam T - the value type.
 * @group Reactivity
 */
export class Sig<T> implements Equatable {
  private _val: T;
  private _binds: AnyBind[] = [];
  private _eq: Eq<T>;

  constructor(val: T, opts?: {eq?: Eq<T>}) {
    this._val = val;
    this._eq = opts?.eq ?? eq;
  }

  /** `Equatable` implementation; two `Sig`s are equal when their values are deeply equal. */
  equals(b: unknown) {
    if (b instanceof Sig) return this._eq(this.get(), b.get());
    return false;
  }

  /** Reads the current value. */
  get(): T {
    return this._val;
  }

  /** Enqueues dependents without changing the value; use after in-place mutation. */
  notify() {
    enqueue(this._binds);
  }

  /** Sets the value and always notifies dependents, even when deeply equal. */
  forceUpdate(v: T) {
    this._val = v;
    this.notify();
  }

  /** Sets the value and notifies dependents only when `eq(v, current)` is false. */
  update(v: T) {
    if (this._eq(v, this._val)) return;
    this.forceUpdate(v);
  }

  /** Applies `fn` to the current value via `update`, so an equal result is skipped. */
  trans(fn: (v: T) => T) {
    this.update(fn(this._val));
  }

  /** Registers a binding. Prefer `createBind` or the `patch`/`text`/`view` APIs. */
  addBind<C extends CmdContext>(bind: Bind<T, C>) {
    this._binds.push(bind);
  }

  /** Unregisters a binding; runs `cleanup()` when the last one goes away. */
  removeBind<C extends CmdContext>(bind: Bind<T, C>) {
    const index = this._binds.indexOf(bind);
    if (index >= 0) this._binds.splice(index, 1);
    if (this._binds.length === 0) {
      this.cleanup();
    }
  }

  /** Returns the current bindings. */
  getBinds(): Bind<T, CmdContext>[] {
    return this._binds;
  }

  /** Overridable hook called when a signal loses all bindings. No-op on `Sig`. */
  // empty: DerivedSig overrides this to detach from its sources when its last
  // observer goes away
  cleanup() {}
}

/**
 * A `Sig` produced by {@link compute}. Extends `Sig` and additionally tracks the
 * source bindings that feed it: it detaches from its sources when it loses its
 * last consumer, and re-links and recomputes once when a consumer is added
 * again.
 *
 * @typeParam T - the derived value type.
 * @group Reactivity
 */
export class DerivedSig<T> extends Sig<T> {
  private _fromBinds: AnyBind[] = [];
  private _linked = true;

  /** Registers a source binding. */
  addFromBind<S, C extends CmdContext>(bind: Bind<S, C>) {
    this._fromBinds.push(bind);
  }

  /** Registers a consumer; re-links to sources and recomputes once if detached. */
  // A derived signal's upstream links are torn down when its last observer
  // goes away, which happens any time a view() subtree is hidden. The existing
  // from-binds are reused (reset `removed`, re-added) and recomputed once:
  // sources usually moved while we were detached.
  //
  // super.addBind must stay first: the recompute below updates this signal
  // straight away, so the returning observer has to be registered before it
  // or it misses the value and only catches up on some later update.
  override addBind<C extends CmdContext>(bind: Bind<T, C>) {
    super.addBind(bind);
    if (this._linked) return;
    this._linked = true;
    // Reuse the existing from-binds instead of recreating them: the same bind
    // objects stay in the queue, so a shared group flag always refers to a live
    // bind. `cleanup` only removed them, so re-adding is enough.
    for (let i = 0; i < this._fromBinds.length; i++) {
      const f = this._fromBinds[i] as AnyBind;
      f.removed = false;
      f.sig.addBind(f);
    }
    // every from-bind shares one context whose cmd reads all sources, so one
    // invocation recomputes the whole derived value. Skip it when any bind of
    // the group is already queued: the pending run will see the current values.
    const first = this._fromBinds[0];
    if (first && !first.queued && !first.group?.queued) {
      first.cmd(first.sig.get(), first.context);
    }
  }

  /** Removes every source binding when the derived signal has no consumers. */
  override cleanup() {
    if (!this._linked) return;
    this._linked = false;
    for (const b of this._fromBinds) removeBind(b);
  }
}

/**
 * Creates a writable signal holding `v`.
 *
 * @param v - the initial value.
 * @param opts - optional settings; `eq` overrides the comparator used by `update`.
 * @returns a new `Sig` for `v`.
 * @example
 * ```ts
 * const count = sig(0);
 * count.get();     // 0
 * count.update(1); // schedules dependents
 * ```
 * @group Reactivity
 */
export const sig = <T>(v: T, opts?: {eq?: Eq<T>}) => new Sig(v, opts);

/**
 * Detaches a binding and marks it removed so queued runs are skipped.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @param bind - the binding to remove.
 * @group Reactivity
 */
export const removeBind = <T, C extends CmdContext>(bind: Bind<T, C>) => {
  bind.removed = true;
  bind.sig.removeBind(bind);
};

/**
 * Wires `cmd(sig.get(), context)` to run whenever `sig` changes.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @param sig - the signal to observe.
 * @param context - the context passed to `cmd`.
 * @param cmd - the command run on change.
 * @returns the registered binding.
 * @group Reactivity
 */
export const createBind = <T, C extends CmdContext>(
  sig: Sig<T>,
  context: C,
  cmd: Cmd<T, C>,
): Bind<T, C> => {
  const bind: Bind<T, C> = {sig, context, cmd, removed: false, queued: false};
  sig.addBind(bind);
  return bind;
};

/**
 * A value that may be plain, a `Sig`, or `undefined`.
 *
 * @typeParam T - the underlying value type.
 * @group Reactivity
 */
export type Reactive<T> = T | Sig<T> | undefined;
