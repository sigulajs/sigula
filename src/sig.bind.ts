import type {Cmd, CmdContext} from './cmd';
import {type Equatable, isEqual} from './eq';

export interface Bind<T, C extends CmdContext> {
  sig: Sig<T>;
  context: C;
  cmd: Cmd<T, C>;
  removed: boolean;
  queued?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: any bind
export type AnyBind = Bind<any, any>;

class Queue {
  private _binds: AnyBind[] = [];
  private head = 0;
  private running = false;
  private scheduled = false;

  addAll(binds: readonly AnyBind[]): this {
    for (const bind of binds) {
      if (bind.queued) continue;
      bind.queued = true;
      this._binds.push(bind);
    }
    if (this._binds.length > this.head) this.kick();
    return this;
  }

  private kick(): void {
    if (this.running || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.running = true;
      this.scheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    this.running = true;
    try {
      while (this.head < this._binds.length) {
        const bind = this._binds[this.head++];
        if (bind) {
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
      }
    } finally {
      this.running = false;
      if (this.head < this._binds.length) {
        // almost impossible in js/ts
        this._binds = this._binds.slice(this.head);
        this.head = 0;
        this.kick();
      } else {
        this._binds.length = 0;
        this.head = 0;
      }
    }
  }
}

const QUEUE = new Queue();

export class Sig<T> implements Equatable {
  private _val: T;
  private _binds: Bind<T, CmdContext>[] = [];

  constructor(val: T) {
    this._val = val;
  }

  equals(b: unknown) {
    if (b instanceof Sig) return isEqual(this.get(), b.get());
    return false;
  }

  get(): T {
    return this._val;
  }

  forceUpdate(v: T) {
    this._val = v;
    QUEUE.addAll(this._binds);
  }

  update(v: T) {
    if (isEqual(v, this._val)) return;
    this.forceUpdate(v);
  }

  trans(fn: (v: T) => T) {
    this.update(fn(this._val));
  }

  addBind<C extends CmdContext>(bind: Bind<T, C>) {
    this._binds.push(bind as unknown as Bind<T, CmdContext>);
  }

  removeBind(bind: Bind<T, CmdContext>) {
    const index = this._binds.indexOf(bind);
    if (index >= 0) this._binds.splice(index, 1);
    if (this._binds.length === 0) {
      this.cleanup();
    }
  }

  getBinds(): Bind<T, CmdContext>[] {
    return this._binds;
  }

  cleanup() {
    // console.log('Sig.cleanup', this);
  }
}

export class DerivedSig<T> extends Sig<T> {
  private _fromBinds: Bind<unknown, CmdContext>[] = [];

  addFromBind<S, C extends CmdContext>(bind: Bind<S, C>) {
    this._fromBinds.push(bind as unknown as Bind<unknown, CmdContext>);
  }

  override cleanup() {
    this._fromBinds.forEach((bind) => {
      removeBind(bind);
    });

    // console.log('DerivedSig.cleanup', this);
  }
}

export const sig = <T>(v: T) => new Sig(v);

export const removeBind = (bind: Bind<unknown, CmdContext>) => {
  bind.removed = true;
  bind.sig.removeBind(bind);
};

export const createBind = <T, C extends CmdContext>(
  sig: Sig<T>,
  context: C,
  cmd: Cmd<T, C>,
): Bind<T, C> => {
  const bind: Bind<T, C> = {sig, context, cmd, removed: false, queued: false};
  sig.addBind(bind);
  return bind;
};
