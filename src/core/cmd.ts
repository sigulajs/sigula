/**
 * Base type for command contexts: an arbitrary string-keyed record.
 *
 * @group Low-level API
 */
export interface CmdContext {
  [key: string]: unknown;
}
/**
 * The unit of work a binding runs: it receives the current value and context.
 *
 * @typeParam T - the value type.
 * @typeParam C - the context type.
 * @group Low-level API
 */
export type Cmd<T, C extends CmdContext> = (val: T, context: C) => void;

/**
 * A {@link Cmd} with erased value and context types.
 *
 * @group Low-level API
 */
// biome-ignore lint/suspicious/noExplicitAny: any cmd
export type AnyCmd = Cmd<any, any>;
