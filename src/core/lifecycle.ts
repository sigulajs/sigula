import {type AnyBind, removeBind} from './sig.bind';

/**
 * The pause/resume/dispose operations shared by views that own a flat set of
 * bindings. `detach` removes the binds from their signals so a hidden view
 * stops reacting but keeps them for `reattach`; `dispose` is permanent and runs
 * any teardown cleanups. `attached` starts true because callers register the
 * binds before constructing the lifecycle.
 *
 * @group Low-level API
 */
export interface BindLifecycle {
  /** Pauses the bindings, keeping them for a later reattach. */
  detach: () => void;
  /** Resumes bindings paused by `detach`, running each once to catch up. */
  reattach: () => void;
  /** Permanently removes the bindings and runs the cleanups. */
  dispose: () => void;
}

export const bindLifecycle = (
  binds: AnyBind[],
  cleanups: (() => void)[] = [],
): BindLifecycle => {
  let attached = true;
  let disposed = false;

  return {
    detach: () => {
      if (!attached || disposed) return;
      attached = false;
      binds.forEach(removeBind);
    },
    reattach: () => {
      if (attached || disposed) return;
      attached = true;
      for (const bind of binds) {
        bind.removed = false;
        bind.queued = false;
        bind.sig.addBind(bind);
        bind.cmd(bind.sig.get(), bind.context);
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (attached) {
        attached = false;
        binds.forEach(removeBind);
      }
      cleanups.forEach((cleanup) => cleanup());
    },
  };
};
