import {err} from './err';

/**
 * An inclusive range of sibling nodes (`start` through `end`).
 *
 * @group Low-level API
 */
export interface Boundary {
  /** The first node in the range. */
  start: Node;
  /** The last node in the range. */
  end: Node;
}

/**
 * Visits every node from `b.start` through `b.end`.
 *
 * @param b - the boundary to walk.
 * @param fn - called with each node.
 * @group Low-level API
 */
// Visits every node from start through end. Callers capture nextSibling before
// mutating, so the walk survives removals and moves.
export const walkBoundary = (b: Boundary, fn: (node: Node) => void) => {
  let n: Node | null = b.start;
  while (n) {
    const next: Node | null = n.nextSibling;
    fn(n);
    if (n === b.end) break;
    n = next;
  }
};

/**
 * Removes every node in the boundary. No-op if the boundary has no parent.
 *
 * @param b - the boundary to remove.
 * @group Low-level API
 */
export const removeBoundary = (b: Boundary) => {
  const parent = b.start.parentNode;
  if (!parent) return;
  walkBoundary(b, (node) => parent.removeChild(node));
};

/**
 * Wraps a node in a {@link Boundary}. A `DocumentFragment` spans its first and
 * last child; any other node covers itself. Throws `E2` on an empty fragment.
 *
 * @param node - the node to wrap.
 * @returns the node's boundary.
 * @group Low-level API
 */
export const toBoundary = (node: Node): Boundary => {
  const b =
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? {start: node.firstChild, end: node.lastChild}
      : {start: node, end: node};
  if (!b.start || !b.end) err('E2');
  return b as Boundary;
};

/**
 * Replaces an entire boundary with `node` and returns the new boundary. Throws
 * `E3` if the old boundary has no parent.
 *
 * @param old - the boundary to replace.
 * @param node - the replacement node.
 * @returns the boundary of the inserted node.
 * @group Low-level API
 */
export const replaceWithNode = (old: Boundary, node: Node): Boundary => {
  const newBoundary = toBoundary(node);
  const parent = old.start.parentNode;
  if (!parent) err('E3');

  if (old.start === old.end) {
    parent.replaceChild(node, old.start);
  } else {
    let n = old.start.nextSibling;
    parent.replaceChild(node, old.start);
    while (n) {
      const next = n.nextSibling;
      parent.removeChild(n);
      if (n === old.end) break;
      n = next;
    }
  }

  return newBoundary;
};
