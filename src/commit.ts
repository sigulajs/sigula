import type {CmdContext} from './cmd';
import {type Bind, removeBind} from './sig.bind';

export interface Commit<T, C extends CmdContext> {
  binds?: Bind<T, C> | Bind<T, C>[];
  children?: Commit<unknown, CmdContext>[];
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
