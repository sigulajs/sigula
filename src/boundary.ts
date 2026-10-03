export interface Boundary {
  start: Node;
  end: Node;
}

export const removeBoundary = (b: Boundary) => {
  const parent = b.start.parentNode;
  if (!parent) {
    return;
  }

  if (b.start === b.end) parent.removeChild(b.start);
  else {
    // walking siblings is faster than a Range
    let n: Node | null = b.start;
    while (n) {
      const next: Node | null = n.nextSibling;
      parent.removeChild(n);
      if (n === b.end) break;
      n = next;
    }
  }
};

export const toBoundary = (node: Node): Boundary => {
  const b =
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? {start: node.firstChild, end: node.lastChild}
      : {start: node, end: node};
  if (!b.start || !b.end) throw new Error('toBoundary: empty fragment');
  return b as Boundary;
};

export const replaceWithNode = (old: Boundary, node: Node) => {
  const newBoundary = toBoundary(node);
  const parent = old.start.parentNode;
  if (!parent)
    throw new Error('replaceWithNode: old boundary has no parentNode');

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
