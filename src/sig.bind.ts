import type {Cmd, CmdContext} from './cmd';
import {type Equatable, isEqual} from './eq';

export interface Bind<T, C extends CmdContext> {
  sig: Sig<T>;
  context: C;
  cmd: Cmd<T, C>;
  removed: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: any bind
export type AnyBind = Bind<any, any>;

interface QueueOptions {
  schedule?: (cb: () => void) => void;
  onError?: (err: unknown, bind: AnyBind) => void;
}

class Queue {
  private _binds: AnyBind[] = [];
  private head = 0;
  private running = false;
  private scheduled = false;

  private readonly scheduleFn: (cb: () => void) => void;
  private readonly onError: (err: unknown, bind: AnyBind) => void;

  constructor(options: QueueOptions = {}) {
    const defaultOnError = (err: unknown, bind: AnyBind): void => {
      console.error('[CallbackQueue] task failed:', err, bind);
    };
    this.scheduleFn = options.schedule ?? ((cb) => queueMicrotask(cb));
    this.onError = options.onError ?? defaultOnError;
  }

  get size(): number {
    return this._binds.length - this.head;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isScheduled(): boolean {
    return this.scheduled;
  }

  add(...binds: AnyBind[]): this {
    for (const bind of binds) {
      this._binds.push(bind);
    }
    if (binds.length > 0) this.kick();
    return this;
  }

  clear(): void {
    this._binds.length = 0;
    this.head = 0;
  }

  private kick(): void {
    if (this.running || this.scheduled) return;
    this.scheduled = true;
    this.scheduleFn(() => {
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
            this.onError(err, bind);
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
    QUEUE.add(...this._binds);
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
    this._binds.splice(index, 1);
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
  const bind: Bind<T, C> = {sig, context, cmd, removed: false};
  sig.addBind(bind);
  return bind;
};
