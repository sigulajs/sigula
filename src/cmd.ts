export interface CmdContext {
  [key: string]: unknown;
}
export type Cmd<T, C extends CmdContext> = (val: T, context: C) => void;
export type AnyCmd = Cmd<any, any>;
