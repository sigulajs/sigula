import type {CmdContext} from './cmd';
import {type Bind, removeBind} from './sig.bind';

// biome-ignore lint/suspicious/noExplicitAny: Commit with any context
export interface Commit<T, C extends CmdContext = any> {
  binds: Bind<T, C> | Bind<T, C>[] | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Commit.children with any context
  children?: Commit<unknown, any>[] | undefined;
}

export const cleanCommit = (commit: Commit<unknown, CmdContext>) => {
  if (commit.binds) {
    if (Array.isArray(commit.binds)) {
      commit.binds.forEach((bind) => {
        removeBind(bind);
      });
    } else {
      removeBind(commit.binds);
    }
  }
  commit.children?.forEach((child) => {
    cleanCommit(child);
  });
};
