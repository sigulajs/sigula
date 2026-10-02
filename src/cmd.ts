export interface CmdContext {
  [key: string]: unknown;
}
export type Cmd<T, C extends CmdContext> = (val: T, context: C) => void;

// biome-ignore lint/suspicious/noExplicitAny: any cmd
export type AnyCmd = Cmd<any, any>;
