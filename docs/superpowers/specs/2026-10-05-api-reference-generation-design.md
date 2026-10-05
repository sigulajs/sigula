# API reference generated from TSDoc

Date: 2026-10-05

## Motivation

Every export now carries TSDoc (the previous change), but the API reference is
still a hand-maintained section in `README.md` that duplicates it. This change
adds a generator that turns the TSDoc into `Reference.md`, and reduces the README
to a pointer so the two cannot drift.

## Deliverables

1. `scripts/gen-reference.ts` — a dependency-free generator that parses
   `dist/sigula.d.ts` line by line.
2. `Reference.md` — the generated API reference, committed.
3. `package.json` — a `docs:api` script: `pnpm build && tsx scripts/gen-reference.ts`
   (uses the existing `tsx` devDependency; no new dependencies).
4. `README.md` — the API listing is removed and replaced by a link to
   `Reference.md`; the Errors table and Reactivity model stay in the README.

## Generator

### Input

`dist/sigula.d.ts`. It is produced by `pnpm build`, its declarations have no
function bodies (clean signatures), and its JSDoc comments survive emit. Running
`pnpm build` first is why the `docs:api` script chains it.

### Extraction

The repo uses `typescript@7` (the native compiler preview), whose package does
**not** expose the classic programmatic API (`ts.createSourceFile`, type
checker); its main export is a version string and the AST API is under an
`unstable/` subpath. So the generator does not use the TypeScript API. Instead it
parses the controlled shape of `dist/sigula.d.ts` directly, line by line:

- `//#region` / `//#endregion` markers, blank lines, and the trailing
  `//# sourceMappingURL=` line are ignored;
- a top-level symbol is a contiguous `/** ... */` JSDoc block immediately
  followed by a line starting with `export ` (a declaration without a preceding
  JSDoc block is still captured);
- an `interface`/`class` declaration spans from its header line to the matching
  `}` at column 0; its members are the lines in between, each optionally preceded
  by its own `/** ... */` block;
- JSDoc is split into a summary (lines before the first `@tag`) and tags; a tag's
  text is its first line after the tag name plus any continuation lines until the
  next `@tag` (this is how `@example` keeps its fenced code block).


### Grouping

Each documented symbol carries `@group`. Groups are emitted in this fixed order:
**Reactivity**, **Templates**, **DOM bindings**, **Control flow**, **Rendering**,
**Low-level API**. Symbols are kept in source/file order within a group. A symbol
without a `@group` falls into a trailing **Other** group (there should be none).

### Rendering

`Reference.md` layout:

- an H1 `# Reference` and a note: "Generated from the TSDoc comments in `src/`.
  Do not edit by hand — run `pnpm docs:api`.";
- one `## <group>` heading per group;
- per symbol, `### \`<name>\``, then:
  - a fenced `ts` block with the signature: the declaration text with the
    `export declare ` / `export ` prefix stripped; an interface or class shows
    its header followed by `{ ... }` (members are documented below);
  - the summary/detail paragraph (`getDocumentationComment`);
  - `**Type parameters**`, `**Parameters**`, and `**Returns**` lists built from
    the `@typeParam`, `@param`, and `@returns` tags (each tag text is
    `<name> - <description>`; render as `` - `<name>` — <description> ``);
  - `**Example**` containing the `@example` text verbatim when it already begins
    with a code fence, otherwise wrapped in a `ts` fence;
  - for interfaces and classes, a `**Members**` list: one bullet per member,
    `` - `<name>` — <member doc> ``, with a `@defaultValue` rendered inline in
    the member's description.

Overloaded functions (`patch`, `compute`) render one signature line per
declaration under the single symbol heading.

### Determinism

Given unchanged source comments, running the generator twice produces byte
identical output; the script always writes the whole file.

## README changes

- Remove the `## 📖 Reference` API listing: the intro bullet list and the
  `### Reactivity`, `### Templates`, `### DOM bindings`, `### Control flow`,
  `### Rendering`, and `### Low-level API` subsections.
- In their place add:

  ````markdown
  ## 📖 Reference

  The full API reference is generated from the TSDoc comments in the source: see [Reference.md](./Reference.md).
  ````

- Promote the remaining `### Errors` and `### Reactivity model` subsections to
  top-level `## Errors` and `## Reactivity model` headings. Their content is
  unchanged; they are conceptual and not export-derived.
- The Features, Installation, Quick Start, and Core Concepts sections are
  unchanged.

## What does not change

No runtime or type changes. `src` is untouched. `tsconfig.json` still includes
only `src`, so the script is not part of `pnpm typecheck`; it is exercised by
running `pnpm docs:api`.

## Verification

- `pnpm docs:api` runs cleanly after `pnpm build` and writes `Reference.md`.
- Running it twice produces no diff.
- `Reference.md` contains every group and all documented symbols, with examples
  and member lists.
- `pnpm test` and `pnpm typecheck` still pass; the README renders with the
  `Reference.md` link and the retained Errors and Reactivity model sections.

## Acceptance criteria

1. `pnpm docs:api` generates `Reference.md` deterministically from `dist/sigula.d.ts`.
2. `Reference.md` lists every exported symbol, grouped per its `@group`, with
   signature, documentation, params/type params/returns, example, and member docs.
3. `README.md` no longer contains the API listing; it links to `Reference.md`,
   and the Errors table and Reactivity model remain.
4. No runtime or type behavior changes; `pnpm test` and `pnpm typecheck` pass.
5. `Reference.md` is committed.
