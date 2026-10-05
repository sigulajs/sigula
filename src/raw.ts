import {
  type AnyView,
  type Boundary,
  type CmdContext,
  createBind,
  removeBind,
  replaceWithNode,
  Sig,
  toBoundary,
} from './core';

interface RawContext extends CmdContext {
  boundary: Boundary;
}

// Parse trusted HTML through a detached <template>. Assigning innerHTML does
// not run scripts, but the parsed nodes are later connected to the document, so
// inline handlers and other vectors still apply and callers must sanitize
// untrusted input. An empty string parses to no nodes; append an empty text
// node so the fragment (and thus the boundary) always has a parent and anchor.
const _parse = (source: string): DocumentFragment => {
  const template = document.createElement('template');
  template.innerHTML = source;
  const content = template.content;
  if (!content.firstChild) content.appendChild(document.createTextNode(''));
  return content;
};

const rawCmd = (val: string, ctx: RawContext) => {
  ctx.boundary = replaceWithNode(ctx.boundary, _parse(val));
};

export const raw = (source: string | Sig<string>): AnyView => {
  const node = _parse(source instanceof Sig ? source.get() : source);
  const ctx: RawContext = {boundary: toBoundary(node)};
  const bind =
    source instanceof Sig ? createBind(source, ctx, rawCmd) : undefined;

  return {
    type: 'view',
    node,
    bind,
    boundary: () => ctx.boundary,
    cleanBinds: () => {
      if (bind) removeBind(bind);
    },
  };
};
