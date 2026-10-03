import {removeBoundary} from './boundary';
import type {CmdContext} from './cmd';
import type {Commit} from './commit';
import {cleanCommit} from './commit';
import type {AnyView} from './view';

export const render = (
  viewArg: AnyView | (() => AnyView),
  node: Node,
): (() => void) => {
  const view = typeof viewArg === 'function' ? viewArg() : viewArg;
  node.appendChild(view.node);
  const commit: Commit<unknown, CmdContext> = {
    binds: view.bind,
    children: view.childCommits,
  };
  return () => {
    cleanCommit(commit);
    // Read the boundary at dispose time, never at mount. view() and repeat()
    // swap ctx.boundary on every update, so the nodes still in the host are
    // the current ones, not the ones render originally appended.
    const boundary = view.live?.();
    if (boundary) removeBoundary(boundary);
  };
};
