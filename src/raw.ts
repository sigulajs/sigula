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

// A detached <template> parses HTML into nodes without executing scripts.
// An empty string parses to no nodes; fall back to an empty text node so the
// view always has a valid boundary anchor.
const _parse = (source: string): Node => {
  const template = document.createElement('template');
  template.innerHTML = source;
  const content = template.content;
  return content.firstChild ? content : document.createTextNode('');
};

const rawCmd = (source: string, ctx: RawContext) => {
  ctx.boundary = replaceWithNode(ctx.boundary, _parse(String(source)));
};

export const raw = (source: string | Sig<string>): AnyView => {
  const node = _parse(String(source instanceof Sig ? source.get() : source));
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
