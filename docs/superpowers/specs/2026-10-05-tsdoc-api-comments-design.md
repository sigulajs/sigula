# TSDoc API comments as the reference source

Date: 2026-10-05

## Motivation

The API reference lives only in `README.md`, hand-written and separate from the
source. Keeping the two in sync is manual, and the README cannot be regenerated.
Adding TSDoc to every exported symbol makes the source the single place an API's
documentation lives, so an API reference can later be generated directly from
the comments.

This change adds the comments only. No generator is wired up here, and the
README is left as-is.

## Scope

Every export from `src/` gets a TSDoc block, and exported interfaces/classes also
get member-level TSDoc. The exports, by file:

- `src/core/sig.bind.ts` — `Bind`, `AnyBind`, `Sig` (class + public members),
  `DerivedSig` (class + public members), `sig`, `createBind`, `removeBind`,
  `Reactive`
- `src/core/compute.ts` — `SigRecord`, `ValRecord`, `compute`
- `src/core/eq.ts` — `Equatable`, `Eq`, `UnknownRecord`, `eq`
- `src/core/cmd.ts` — `CmdContext`, `Cmd`, `AnyCmd`
- `src/core/boundary.ts` — `Boundary`, `toBoundary`, `walkBoundary`,
  `removeBoundary`, `replaceWithNode`
- `src/core/patch.core.ts` — `Patch`, `PatchContext`, `PatchItem`, `ToPatchItem`,
  `AnyPatchItem`, `ToAnyPatchItem`
- `src/core/view.core.ts` — `ChildView`, `View`, `AnyView`, `ViewContext`,
  `replaceWithView`
- `src/core/utils.ts` — `at`
- `src/core/err.ts` — `err`
- `src/html.ts` — `html`
- `src/text.ts` — `text`
- `src/raw.ts` — `raw`
- `src/patch.ts` — `PatchProps`, `WritableStyleKey`, `ActFn`, `patch`, `id`,
  `val`, `attr`, `style`, `styleProp`, `toggleClass`, `toggleClasses`, `act`, `on`
- `src/view.ts` — `view`
- `src/repeat.ts` — `RepeatProp`, `RepeatContext`, `repeat`
- `src/list.ts` — `list`
- `src/frag.ts` — `frag`
- `src/render.ts` — `render`

The barrel files `src/index.ts` and `src/core/index.ts` re-export only; they need
no per-symbol comments.

## Format

Each exported symbol is preceded by a TSDoc block:

```ts
/**
 * Summary sentence.
 *
 * Optional detail paragraph, taken from the README Reference where one exists.
 *
 * @param key - the attribute name.
 * @param source - a plain value or a `Sig`.
 * @returns the deferred patch-item factory.
 * @example
 * ```ts
 * html`<span ${patch(style('color', color))}>text</span>`;
 * ```
 * @group DOM bindings
 */
```

Tags:

- a summary line followed by an optional detail paragraph;
- `@param` for each parameter of a callable;
- `@typeParam` for each generic type parameter where it adds information;
- `@returns` for callables that return a value (omit for `void`);
- `@example` with a fenced `ts` block where the README has one for that symbol;
- `@defaultValue` where a default exists (for example, `repeat`'s `compare`
  defaults to `eq`);
- `@group` on every symbol, per the mapping below.

Error codes stay in the README's Errors table; comments reference them inline
where relevant (for example, `toBoundary` "throws `E2` on an empty fragment").

### Members

- Exported interfaces document each property/index signature member.
- Exported classes document the class and each public member method
  (`Sig`: `get`, `update`, `forceUpdate`, `notify`, `trans`, `equals`, `addBind`,
  `removeBind`, `getBinds`, `cleanup`; `DerivedSig`: `addFromBind`, overridden
  `addBind`, overridden `cleanup`). Private members are not documented.
- Overloaded functions (`patch`, `compute`) put the full block on the first
  overload and a one-line summary on later overloads, so the emitted declaration
  file carries documentation for every overload.

## `@group` mapping

Groups mirror the README Reference sections.

- **Reactivity** — `sig`, `Sig`, `DerivedSig`, `compute`, `eq`, `Equatable`,
  `UnknownRecord`, `Bind`, `AnyBind`, `createBind`, `removeBind`, `SigRecord`,
  `ValRecord`, `Eq`, `Reactive`
- **Templates** — `html`, `text`, `raw`, `View`, `AnyView`, `ChildView`,
  `ViewContext`, `replaceWithView`
- **DOM bindings** — `patch`, `PatchProps`, `id`, `val`, `attr`, `style`,
  `styleProp`, `toggleClass`, `toggleClasses`, `act`, `ActFn`, `on`, `Patch`,
  `PatchContext`, `PatchItem`, `ToPatchItem`, `AnyPatchItem`, `ToAnyPatchItem`,
  `WritableStyleKey`
- **Control flow** — `view`, `repeat`, `RepeatProp`, `RepeatContext`, `list`,
  `frag`
- **Rendering** — `render`
- **Low-level API** — `Boundary`, `toBoundary`, `walkBoundary`, `removeBoundary`,
  `replaceWithNode`, `Cmd`, `AnyCmd`, `CmdContext`, `at`, `err`

## What does not change

No runtime code and no types change. Comments are stripped from the JS bundle;
they are expected to appear in the emitted `dist/sigula.d.ts`. The README is not
edited. The existing README/export naming mismatch (`isEqual` in the README vs
the exported `eq`) is out of scope and left untouched.

## Testing / verification

There is no new runtime test. Verification is:

- `pnpm test` and `pnpm typecheck` still pass;
- `pnpm build` succeeds;
- the emitted `dist/sigula.d.ts` contains a known comment phrase (for example the
  `notify` summary), proving comments survive type emit;
- every export listed above has a TSDoc block, and every `@group` value is one of
  the six listed.

## Acceptance criteria

1. Every export in the Scope list has a TSDoc block with a summary and the
   applicable tags.
2. Exported interfaces and classes have member-level TSDoc; overloaded functions
   document every overload.
3. Every documented symbol carries a `@group` from the mapping.
4. No runtime or type behavior changes; `pnpm test` and `pnpm typecheck` pass.
5. `dist/sigula.d.ts` is emitted with the comments intact.
