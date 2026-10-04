import {err} from './err';

export interface Boundary {
  start: Node;
  end: Node;
}

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

export const removeBoundary = (b: Boundary) => {
  const parent = b.start.parentNode;
  if (!parent) return;
  walkBoundary(b, (node) => parent.removeChild(node));
};

export const toBoundary = (node: Node): Boundary => {
  const b =
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? {start: node.firstChild, end: node.lastChild}
      : {start: node, end: node};
  if (!b.start || !b.end) err('E2');
  return b as Boundary;
};

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
