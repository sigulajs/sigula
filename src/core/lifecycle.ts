import {type AnyBind, removeBind} from './sig.bind';

/**
 * An owner whose flat set of bindings can be detached and reattached. The
 * `attached` flag lives on the owner so the helpers are stateless.
 *
 * @group Low-level API
 */
export interface Binder {
  /** Whether the owner's bindings are currently attached to their signals. */
  attached: boolean;
}

/**
 * Removes `binds` from their signals and runs the cleanups. No-op when already
 * detached.
 *
 * @param owner - the object holding the `attached` flag.
 * @param binds - the bindings to remove.
 * @param cleanups - teardown hooks, run after the binds are removed.
 * @group Low-level API
 */
export const detachBinds = (
  owner: Binder,
  binds: readonly AnyBind[],
  cleanups: readonly (() => void)[] = [],
): void => {
  if (!owner.attached) return;
  owner.attached = false;
  binds.forEach(removeBind);
  cleanups.forEach((cleanup) => {
    cleanup();
  });
};

/**
 * Re-adds `binds` removed by {@link detachBinds} and runs each once to catch up
 * to the current signal values. No-op when already attached.
 *
 * @param owner - the object holding the `attached` flag.
 * @param binds - the bindings to re-add.
 * @group Low-level API
 */
export const reattachBinds = (
  owner: Binder,
  binds: readonly AnyBind[],
): void => {
  if (owner.attached) return;
  owner.attached = true;
  for (const bind of binds) {
    bind.removed = false;
    bind.queued = false;
    bind.sig.addBind(bind);
    bind.cmd(bind.sig.get(), bind.context);
  }
};
