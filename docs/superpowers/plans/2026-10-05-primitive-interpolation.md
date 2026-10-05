# Primitive Interpolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `html` content interpolations accept plain values and `Sig`s directly, auto-normalizing them to text views.

**Architecture:** Normalize interpolations once at the top of `html`, before the template cache, shape bitmask, marker scanning, and commit phase run. Two discriminators (`isPatch`, `isView`) pass views and patches through; everything else goes through the existing `text()` factory, which already binds `Sig`s reactively and `String()`s everything else. All downstream code stays unchanged because every normalized item carries a `.type`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-primitive-interpolation-design.md`

---

## Files

- Modify: `src/html.ts` — add `isPatch`/`isView`/`_toItem`, widen the `html` item type, normalize at the top.
- Modify: `src/test/html.test.ts` — add primitive interpolation cases.
- Modify: `README.md` — document the third interpolation kind and the `String()` policy.

No files are created.

---

### Task 1: Normalize primitive interpolations in `html`

**Files:**
- Modify: `src/html.ts:1-14` (imports), `src/html.ts:69-71` (guards area), `src/html.ts:125-131` (signature + slot check)
- Test: `src/test/html.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/test/html.test.ts`, insert these cases inside the existing `describe('html', () => { ... })` block, immediately before its closing `});` (currently the end of the file):

```ts
  it('renders primitive content interpolations as text', () => {
    render(html`<p>${'hi'} ${42}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>hi 42</p>');
  });

  it('stringifies nullish and boolean interpolations', () => {
    render(html`<p>${null}|${undefined}|${false}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>null|undefined|false</p>');
  });

  it('binds a Sig interpolation reactively and detaches on dispose', async () => {
    const name = sig('Alice');
    const dispose = render(html`<p>Hello, ${name}!</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>Hello, Alice!</p>');

    name.update('Bob');
    await Promise.resolve();
    expect(document.body.innerHTML).toBe('<p>Hello, Bob!</p>');

    dispose();
    expect(name.getBinds().length).toBe(0);
  });

  it('mixes explicit views and primitive interpolations', () => {
    const n = sig(1);
    render(html`<p>${text(n)} and ${'x'}</p>`, document.body);
    expect(document.body.innerHTML).toBe('<p>1 and x</p>');
  });

  it('shares one cache shape between a view and a primitive at the same slot', () => {
    const slot = (primitive: boolean) =>
      html`<p>${primitive ? 'plain' : text('wrapped')}</p>`;

    render(slot(true), document.body);
    expect(document.body.innerHTML).toBe('<p>plain</p>');

    document.body.innerHTML = '';
    render(slot(false), document.body);
    expect(document.body.innerHTML).toBe('<p>wrapped</p>');
  });

  it('rejects a primitive in an attribute position', () => {
    expect(() => render(html`<div class=${'x'}></div>`, document.body)).toThrow(
      'E12',
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/test/html.test.ts`
Expected: FAIL. The new primitive cases throw `TypeError` because `_toMark` reads `.type` off a string/`null` and `commitView` reads `.node` off a non-view. The attribute-position case already passes today (a string in a tag hits `E12`), so it acts as a regression guard rather than a red test.

- [ ] **Step 3: Import `text` into `src/html.ts`**

Add after the existing `./core` import block (currently ends at line 14):

```ts
import {text} from './text';
```

- [ ] **Step 4: Add the discriminators and normalizer to `src/html.ts`**

Directly after the existing `_isView` declaration (currently line 71):

```ts
const isPatch = (item: unknown): item is Patch =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'patch';

const isView = (item: unknown): item is AnyView =>
  typeof item === 'object' &&
  item !== null &&
  (item as {type?: string}).type === 'view';

const _toItem = (item: unknown): Patch | AnyView =>
  isPatch(item) || isView(item) ? item : text(item);
```

The existing `_isView` (which checks a comment node's data) is easy to confuse with the new `isView`. Rename the existing one to `_isViewMark` and update its single use:

```ts
const _isViewMark = (item: Comment) => item.data.trim() === MARK;
```

and in `_scan`'s `hit` callback (currently line 162):

```ts
            : node.nodeType === Node.COMMENT_NODE && _isViewMark(node as Comment),
```

- [ ] **Step 5: Widen the `html` signature and normalize**

Replace the block at the top of `html` (currently lines 125-131):

```ts
export const html = (
  strs: TemplateStringsArray,
  ...items: (Patch | AnyView)[]
): View => {
  if (strs.length <= 1 && !strs?.[0]) err('E10');
  const slots = strs.length - 1;
  if (items.length !== slots) err(`E11:${slots}:${items.length}`);
```

with:

```ts
type TextValue = string | number | boolean | bigint | null | undefined;
type HtmlItem = Patch | AnyView | TextValue | Sig<any>;

export const html = (
  strs: TemplateStringsArray,
  ...rawItems: HtmlItem[]
): View => {
  if (strs.length <= 1 && !strs?.[0]) err('E10');
  const slots = strs.length - 1;
  if (rawItems.length !== slots) err(`E11:${slots}:${rawItems.length}`);

  const items = rawItems.map(_toItem);
```

Everything from `let frag: DocumentFragment;` down is untouched: `_shape(items)`, `_text(strs, ...items)`, `_scan`, `commitPatch`/`commitView`, `toBoundary`, and `cleanBinds` all receive normalized items.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/test/html.test.ts`
Expected: PASS, including all pre-existing `html` cases.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors. `Sig` is invariant because of its private `_eq: Eq<T>` field, so `HtmlItem` uses `Sig<any>`; `Sig<string>` is assignable to it.

- [ ] **Step 8: Commit**

```bash
git add src/html.ts src/test/html.test.ts
git commit -m "feat: normalize primitive interpolations in html"
```

---

### Task 2: Document the primitive interpolation kind in `README.md`

**Files:**
- Modify: `README.md` — the `html` section (currently lines 379-398) and the `E12` error row (currently line 764).

- [ ] **Step 1: Replace the `html` section**

Replace the section beginning `#### \`html\`` through the caching paragraph (currently lines 379-398) with:

````markdown
#### `html`

```ts
type TextValue = string | number | boolean | bigint | null | undefined;
type HtmlItem = Patch | AnyView | TextValue | Sig<any>;

const html: (strs: TemplateStringsArray, ...items: HtmlItem[]) => View;
```

Tagged template that parses native HTML and returns a `View`. Three kinds of interpolation are supported:

- a `View` (from `text`, `view`, `repeat`, or another `html`) fills a content position
- a `Patch` (from `patch(...)`) fills an attribute position
- a plain value or a `Sig` fills a content position as text: a `Sig` binds reactively, and any other value becomes `String(value)`, so `null`, `undefined`, and `false` render as `"null"`, `"undefined"`, and `"false"`

```ts
html`<p>${text(label)}</p>`;
html`<p>Hello, ${name}!</p>`;
html`<button ${patch(on('click', handler))}>Go</button>`;
```

Text values are content-only; using one in an attribute position throws `E12`. Use `patch({...})` or `attr()` for attributes.

Templates are cached per call site, so repeated renders skip parsing. Using `patch(...)` in a content position throws `E12`. An interpolation count that does not match the number of slots throws `E11:<expected>:<got>`; a mismatch means the cached template for that call site was built from a different mix of interpolations. See [Errors](#errors).
````

- [ ] **Step 2: Update the `E12` error row**

Replace (currently line 764):

```markdown
| `E12` | `html` | Unmatched interpolation; `patch()` must be in attribute position. |
```

with:

```markdown
| `E12` | `html` | Unmatched interpolation; a `Patch` must be in an attribute position and a `View`/text value in a content position. |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document primitive interpolation in html"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. The `html` suite now includes the primitive cases; no other suite changes.

- [ ] **Step 2: Build to validate declaration output**

Run: `pnpm build`
Expected: build succeeds and `dist/sigula.d.ts` shows the widened `html` item type. If tsdown rewrites `package.json`, confirm `git diff` shows only expected changes and revert unrelated churn.

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `html` accepts `TextValue` and `Sig` content interpolations and renders text nodes.
- `Sig` interpolation is reactive and detaches through the existing bind machinery.
- `null`/`undefined`/`false` stringify rather than being skipped.
- `Patch`/`View` interpolations and the template cache are unchanged; attribute primitives throw `E12`.
- `pnpm test` and `pnpm typecheck` pass.
