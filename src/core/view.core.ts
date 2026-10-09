import {type Boundary, removeBoundary, replaceWithNode} from './boundary';
import type {CmdContext} from './cmd';
import {err} from './err';
import type {Patch} from './patch.core';
import type {Bind} from './sig.bind';

/**
 * An item that can occupy a slot in a view's children: a view or a patch.
 *
 * @group Templates
 */
export type ChildView = AnyView | Patch;

/**
 * The unit returned by `html`, `text`, `raw`, `view`, `repeat`, `list`, and
 * `frag`.
 *
 * @typeParam T - the bound value type.
 * @typeParam C - the bind context type.
 * @group Templates
 */
// biome-ignore lint/suspicious/noExplicitAny: View with any context
export interface View<T = unknown, C extends CmdContext = any> {
  /** Discriminant identifying a view. */
  type: 'view';
  /** The DOM node or `DocumentFragment` the view occupies. */
  node: Node;
  /** The view's own binding, when it is reactive. */
  bind?: Bind<T, C> | undefined;
  /** Detaches the view's bindings and, recursively, those of its children. */
  cleanBinds: () => void;
  /**
   * Internal: removes the view's bindings from their signals but keeps them so
   * {@link reattachBinds} can restore them. Used when a control-flow view swaps
   * the view out without disposing it.
   */
  detachBinds?: (() => void) | undefined;
  /**
   * Internal: re-adds bindings removed by {@link detachBinds} and runs each
   * once to catch up to the current signal values.
   */
  reattachBinds?: (() => void) | undefined;
  /** Returns the nodes the view currently occupies. */
  boundary: () => Boundary;

  /** The interpolated children of a template view. */
  children?: ChildView[] | undefined;

  // Internal: set once the view has been committed by a template, so a second
  // commit can be rejected (`E13`).
  committed?: boolean;
}

/**
 * A {@link View} with erased value and context types.
 *
 * @group Templates
 */
// biome-ignore lint/suspicious/noExplicitAny: any view
export type AnyView = View<any, any>;

/**
 * Context for the `view` command: the current inner view and the view factory.
 *
 * @typeParam T - the value type.
 * @group Templates
 */
export interface ViewContext<T> extends CmdContext {
  /** The currently mounted inner view. */
  inner: AnyView;
  /** Builds the next inner view from a new value. */
  viewFn: (val: T) => AnyView;
}

/**
 * Replaces an existing boundary with a view's node and returns the new boundary.
 *
 * @param old - the boundary to replace.
 * @param view - the view to mount.
 * @returns the boundary of the mounted view.
 * @group Templates
 */
export const replaceWithView = (old: Boundary, view: View): Boundary => {
  const node = view.node;
  // A view backed by a fragment is emptied the first time it is mounted: its
  // children move into the document and the fragment is left with none. When
  // the same instance is shown again its live nodes are its boundary, so move
  // those back rather than the (now empty) node. This is how `view()` restores
  // a view it swapped out; it is not a second `commit` of the same node.
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !node.firstChild) {
    const next = view.boundary();
    const parent = old.start.parentNode;
    if (!parent) err('E3');
    const nodes: Node[] = [];
    let n: Node | null = next.start;
    while (n) {
      nodes.push(n);
      if (n === next.end) break;
      n = n.nextSibling;
    }
    for (const node of nodes) parent.insertBefore(node, old.start);
    removeBoundary(old);
    return next;
  }
  return replaceWithNode(old, node);
};
