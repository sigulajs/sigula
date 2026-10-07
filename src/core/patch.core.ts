import type {Cmd, CmdContext} from './cmd';
import type {Sig} from './sig.bind';

/**
 * A collection of deferred bindings to apply to one element, produced by
 * {@link patch}.
 *
 * @group DOM bindings
 */
export interface Patch {
  /** Discriminant identifying a patch. */
  type: 'patch';
  /** Deferred patch-item factories, resolved against the target element on mount. */
  toPatchItems: ToAnyPatchItem[];
  /** Detaches the bindings created when the patch was committed. */
  cleanBinds: () => void;
}

/**
 * Context passed to patch commands: the target node plus any extra arguments.
 *
 * @group DOM bindings
 */
export interface PatchContext extends CmdContext {
  /** The element the binding applies to. */
  node: Node;
  /** Extra arguments for the command, such as the attribute or style key. */
  extra?: unknown[];
  // Internal: a teardown hook a command can register for `patch.cleanBinds`.
  cleanup?: () => void;
}

/**
 * One resolved patch binding: a source value, its context, and the command.
 *
 * @typeParam T - the source value type.
 * @group DOM bindings
 */
export interface PatchItem<T> {
  /** The plain value or `Sig` the command binds. */
  source: T | Sig<T>;
  /** The context passed to `cmd`. */
  context: PatchContext;
  /** The command run with the value and context. */
  cmd: Cmd<T, PatchContext>;
}
/**
 * A factory that defers reading the target element until mount.
 *
 * @typeParam T - the source value type.
 * @group DOM bindings
 */
export type ToPatchItem<T> = (el: Element) => PatchItem<T>;

/**
 * A {@link PatchItem} with an erased value type.
 *
 * @group DOM bindings
 */
// biome-ignore lint/suspicious/noExplicitAny: any patch item
export type AnyPatchItem = PatchItem<any>;
/**
 * A {@link ToPatchItem} with an erased value type.
 *
 * @group DOM bindings
 */
export type ToAnyPatchItem = (el: Element) => AnyPatchItem;
