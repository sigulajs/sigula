import {type AnyBind, removeBind} from './sig.bind';

// Re-adds one bind to its signal and runs its command once to catch up.
const attach = (bind: AnyBind): void => {
  bind.removed = false;
  bind.queued = false;
  bind.sig.addBind(bind);
  bind.cmd(bind.sig.get(), bind.context);
};

/**
 * Removes a single bind from its signal. No-op when `bind` is absent or already
 * detached, so it is safe to call from an idempotent `detach`.
 *
 * @param bind - the binding to remove.
 * @group Low-level API
 */
export const detachBind = (bind: AnyBind | undefined): void => {
  if (bind && !bind.removed) removeBind(bind);
};

/**
 * Re-adds a single bind removed by {@link detachBind} and catches it up. No-op
 * when `bind` is absent or still attached.
 *
 * @param bind - the binding to re-add.
 * @group Low-level API
 */
export const reattachBind = (bind: AnyBind | undefined): void => {
  if (bind?.removed) attach(bind);
};

/**
 * An owner of several bindings whose attach state is tracked by an `attached`
 * flag. Only `Patch` needs this: a patch can own many binds and one-shot
 * cleanups, so its state cannot be derived from a single bind.
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
  binds.forEach(attach);
};
