export interface Boundary {
  start: Node;
  end: Node;
}

export const removeBoundary = (b: Boundary) => {
  if (b.start === b.end) b.start.parentNode?.removeChild(b.start);
  else {
    const range = document.createRange();
    range.setStartBefore(b.start);
    range.setEndAfter(b.end);
    range.deleteContents();
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

export const repleaceWithNode = (old: Boundary, node: Node) => {
  const newBoundary = toBoundary(node);
  if (old.start === old.end) {
    old.start.parentNode?.replaceChild(node, old.start);
  } else {
    const doc = old.start.ownerDocument ?? document;
    const range = doc.createRange();
    range.setStartBefore(old.start);
    range.setEndAfter(old.end);
    range.deleteContents();
    range.insertNode(node);
  }
  return newBoundary;
};
