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

// Parse trusted HTML through a detached <template>. Scripts inserted this way
// are inert, but inline handlers and other vectors still apply on connect, so
// callers must sanitize untrusted input. An empty string parses to no nodes;
// fall back to an empty text node so the view always has a valid boundary
// anchor.
const _parse = (source: string): Node => {
  const template = document.createElement('template');
  template.innerHTML = source;
  const content = template.content;
  return content.firstChild ? content : document.createTextNode('');
};

const rawCmd = (val: string, ctx: RawContext) => {
  ctx.boundary = replaceWithNode(ctx.boundary, _parse(val));
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
