import {
  type AnyView,
  type Boundary,
  type CmdContext,
  createBind,
  replaceWithNode,
  Sig,
  toBoundary,
} from './core';
import {bindLifecycle} from './core/lifecycle';

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

/**
 * Parses its value as HTML and mounts the resulting nodes with no wrapper
 * element. Unlike `text`, the value is **not** escaped, so only pass trusted
 * HTML; inline handlers and other vectors still apply once the nodes connect.
 * A `Sig` re-parses and replaces the content on change; an empty string renders
 * nothing.
 *
 * @param source - an HTML string or a `Sig` of one.
 * @returns a content-position `View`.
 * @example
 * ```ts
 * html`<article>${raw(post.bodyHtml)}</article>`;
 * ```
 * @group Templates
 */
export const raw = (source: string | Sig<string>): AnyView => {
  const node = _parse(source instanceof Sig ? source.get() : source);
  const ctx: RawContext = {boundary: toBoundary(node)};
  const bind =
    source instanceof Sig ? createBind(source, ctx, rawCmd) : undefined;

  const life = bindLifecycle(bind ? [bind] : []);
  return {
    type: 'view',
    node,
    bind,
    boundary: () => ctx.boundary,
    cleanBinds: life.dispose,
    detachBinds: life.detach,
    reattachBinds: life.reattach,
  };
};
