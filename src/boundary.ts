export interface Boundary {
  start: Node;
  end: Node;
}

export const removeBoundary = (b: Boundary) => {
  const parent = b.start.parentNode;
  if (!parent) {
    // console.warn('boundary has no parent');
    return;
  }

  // if (b.start === b.end) b.start.parentNode?.removeChild(b.start);
  if (b.start === b.end) parent.removeChild(b.start);
  else {
    // const range = document.createRange();
    // range.setStartBefore(b.start);
    // range.setEndAfter(b.end);
    // range.deleteContents();
    //
    // faster without range
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

export const repleaceWithNode = (old: Boundary, node: Node) => {
  const newBoundary = toBoundary(node);
  const parent = old.start.parentNode;
  if (!parent)
    throw new Error('replaceWithNode: old boundary has no parentNode');

  let n = old.start.nextSibling;
  parent.replaceChild(node, old.start);
  while (n) {
    const next = n.nextSibling;
    parent.removeChild(n);
    if (n === old.end) break;
    n = next;
  }

  // if (old.start === old.end) {
  //   parent.replaceChild(node, old.start);
  // } else {
  //   console.log('-----------------------> replace with ndoe + range');
  //   const doc = old.start.ownerDocument ?? document;
  //   const range = doc.createRange();
  //   range.setStartBefore(old.start);
  //   range.setEndAfter(old.end);
  //   range.deleteContents();
  //   range.insertNode(node);
  // }
  return newBoundary;
};
