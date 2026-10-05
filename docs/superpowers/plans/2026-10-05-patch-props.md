# PatchProps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an object form to `patch` (`patch({id, val, class, style, styleProp, on, ...attrs})`) that desugars into the existing commands, and rename the `styleProperty` command to `styleProp`.

**Architecture:** `patch` gains two overloads and classifies its first argument by `typeof === 'function'` (existing vararg path) vs object (props path). The props path expands each key into the existing command factories (`id`, `val`, `toggleClass`, `style`, `styleProp`, `on`, `attr`) and concatenates the result with any vararg items. No change to `Patch`, `PatchContext`, `commitPatch`, binding, or teardown: props produce ordinary patch items.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-patch-props-design.md`

---

## Files

- Modify: `src/patch.ts` — rename `styleProperty` → `styleProp`; add `Reactive`, `PatchProps`, `patch` overloads, `_propsToItems`.
- Modify: `src/test/patch.test.ts` — rename import/usage; add props tests.
- Modify: `README.md` — document the props form, rename `styleProperty`.

No files are created.

---

### Task 1: Rename `styleProperty` command to `styleProp`

Mechanical rename so the command name matches the new props key. No behavior change.

**Files:**
- Modify: `src/patch.ts:91-98`
- Modify: `src/test/patch.test.ts:13,74-85`
- Modify: `README.md:492-502,713`

- [ ] **Step 1: Rename the command in `src/patch.ts`**

Replace this block:

```ts
const stylePropertyCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

export const styleProperty = <T>(
  source: T | Sig<T>,
  key: string,
): ToPatchItem<T> => _toPatchItem(source, [key], stylePropertyCmd);
```

with:

```ts
const stylePropCmd = <T>(val: T, ctx: PatchContext) => {
  (ctx.node as HTMLElement).style.setProperty(_key(ctx), String(val));
};

export const styleProp = <T>(
  source: T | Sig<T>,
  key: string,
): ToPatchItem<T> => _toPatchItem(source, [key], stylePropCmd);
```

- [ ] **Step 2: Update the test import and case in `src/test/patch.test.ts`**

Change the import on line 13 from `styleProperty,` to `styleProp,`.

Rename the test and its call:

```ts
  it('styleProp', async () => {
    const s = sig('10px');
    render(
      html`<div ${patch(styleProp(s, '--size'))}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.getPropertyValue('--size')).toBe('10px');
    s.forceUpdate('20px');
    await flush();
    expect(div.style.getPropertyValue('--size')).toBe('20px');
  });
```

- [ ] **Step 3: Update `README.md`**

Rename the section heading and signature (around line 492):

````markdown
#### `styleProp`

```ts
const styleProp: <T>(source: T | Sig<T>, key: string) => ToPatchItem<T>;
```

Sets a style property via `CSSStyleDeclaration.setProperty`. Use this for custom properties (`--my-var`) or untyped names.

```ts
html`<div ${patch(styleProp(size, '--size'))}></div>`;
```
````

In the error table (around line 713), change the `E4` row text from `` `attr`, `style`, `styleProperty`, `toggleClass` `` to `` `attr`, `style`, `styleProp`, `toggleClass` ``.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. No references to `styleProperty` remain.

- [ ] **Step 5: Commit**

```bash
git add src/patch.ts src/test/patch.test.ts README.md
git commit -m "refactor: rename styleProperty command to styleProp"
```

---

### Task 2: Add `PatchProps` types, `patch` overloads, and desugaring

**Files:**
- Modify: `src/patch.ts`
- Test: `src/test/patch.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/test/patch.test.ts`, add `type PatchProps` to the import from `..` (alongside `type Sig`). Then add these cases inside the existing `describe('patch', () => { ... })` block, before the closing `});`:

```ts
  it('props: static id, val and attr', () => {
    render(
      html`<input ${patch({id: 'test', val: 'one', placeholder: 'name'})} />`,
      document.body,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('test');
    expect(input.value).toBe('one');
    expect(input.getAttribute('placeholder')).toBe('name');
  });

  it('props: reactive id, val and attr update', async () => {
    const sid = sig('a');
    const sval = sig('one');
    const sattr = sig('red');
    render(
      html`<input ${patch({id: sid, val: sval, 'data-color': sattr})} />`,
      document.body,
    );
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('a');
    expect(input.value).toBe('one');
    expect(input.getAttribute('data-color')).toBe('red');
    sid.forceUpdate('b');
    sval.forceUpdate('two');
    sattr.forceUpdate('blue');
    await flush();
    expect(input.id).toBe('b');
    expect(input.value).toBe('two');
    expect(input.getAttribute('data-color')).toBe('blue');
  });

  it('props: class map toggles and updates', async () => {
    const active = sig(true);
    const hidden = sig(false);
    render(
      html`<div ${patch({class: {active, hidden}})}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as Element;
    expect(div.classList.contains('active')).toBe(true);
    expect(div.classList.contains('hidden')).toBe(false);
    active.forceUpdate(false);
    hidden.forceUpdate(true);
    await flush();
    expect(div.classList.contains('active')).toBe(false);
    expect(div.classList.contains('hidden')).toBe(true);
  });

  it('props: reactive style and styleProp', async () => {
    const color = sig('red');
    const size = sig('10px');
    render(
      html`<div ${patch({style: {color}, styleProp: {'--size': size}})}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as HTMLElement;
    expect(div.style.color).toBe('red');
    expect(div.style.getPropertyValue('--size')).toBe('10px');
    color.forceUpdate('blue');
    size.forceUpdate('20px');
    await flush();
    expect(div.style.color).toBe('blue');
    expect(div.style.getPropertyValue('--size')).toBe('20px');
  });

  it('props: on registers a listener', () => {
    const handler = vi.fn();
    render(
      html`<button ${patch({on: {click: handler}})}>go</button>`,
      document.body,
    );
    document.querySelector('button')?.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('props: composes with patch items', () => {
    const s = sig('x');
    render(
      html`<div ${patch({id: 'a'}, attr(s, 'data-x'))}></div>`,
      document.body,
    );
    const div = document.querySelector('div') as Element;
    expect(div.id).toBe('a');
    expect(div.getAttribute('data-x')).toBe('x');
  });

  it('props: empty object is a no-op', () => {
    render(html`<div ${patch({})}>x</div>`, document.body);
    expect(document.querySelector('div')?.innerHTML).toBe('x');
  });

  it('props: skips undefined values', () => {
    const props = {} as PatchProps;
    (props as Record<string, unknown>)['data-x'] = undefined;
    render(html`<div ${patch(props)}></div>`, document.body);
    expect(document.querySelector('div')?.hasAttribute('data-x')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/test/patch.test.ts -t "props"`
Expected: FAIL. The current `patch` treats the props object as a patch-item function, so committing it throws `TypeError: ... is not a function` (and `pnpm typecheck` reports `PatchProps`/object-form errors).

- [ ] **Step 3: Add the types to `src/patch.ts`**

Immediately after `export type ToAnyPatchItem = ...;` insert:

```ts

type Reactive<T> = T | Sig<T>;

export interface PatchProps {
  id?: Reactive<string>;
  val?: Reactive<string>;
  class?: Record<string, Reactive<boolean>>;
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  styleProp?: Record<string, Reactive<string>>;
  on?: {[K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void};
  [attr: string]: unknown;
}
```

(`WritableStyleKey` is declared later in the file; that is fine for a type reference.)

- [ ] **Step 4: Replace the `patch` implementation with overloads**

Replace:

```ts
export const patch = (...toPatchItems: ToAnyPatchItem[]): Patch => ({
  type: 'patch',
  toPatchItems,
  cleanBinds: _noop,
});
```

with:

```ts
export function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
export function patch(...toPatchItems: ToAnyPatchItem[]): Patch;
export function patch(
  first?: PatchProps | ToAnyPatchItem,
  ...rest: ToAnyPatchItem[]
): Patch {
  const toPatchItems =
    typeof first === 'function'
      ? [first, ...rest]
      : first
        ? [..._propsToItems(first), ...rest]
        : rest;
  return {type: 'patch', toPatchItems, cleanBinds: _noop};
}
```

- [ ] **Step 5: Add the desugarer at the end of `src/patch.ts`**

Append:

```ts
const _propsToItems = (props: PatchProps): ToAnyPatchItem[] => {
  const items: ToAnyPatchItem[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    switch (key) {
      case 'id':
        items.push(id(value as Reactive<string>));
        break;
      case 'val':
        items.push(val(value as Reactive<string>));
        break;
      case 'class':
        for (const [token, v] of Object.entries(
          value as Record<string, Reactive<boolean>>,
        )) {
          if (v !== undefined) items.push(toggleClass(v, token));
        }
        break;
      case 'style':
        for (const [name, v] of Object.entries(
          value as Partial<Record<WritableStyleKey, Reactive<string>>>,
        )) {
          if (v !== undefined) items.push(style(v, name as WritableStyleKey));
        }
        break;
      case 'styleProp':
        for (const [name, v] of Object.entries(
          value as Record<string, Reactive<string>>,
        )) {
          if (v !== undefined) items.push(styleProp(v, name));
        }
        break;
      case 'on':
        for (const [type, listener] of Object.entries(
          value as Record<string, _Listener<keyof HTMLElementEventMap>>,
        )) {
          items.push(on(type as keyof HTMLElementEventMap, listener));
        }
        break;
      default:
        items.push(attr(value, key));
    }
  }
  return items;
};
```

`_propsToItems` is a hoisted function declaration, so `patch` may call it even though it is defined later. Its body runs only at `patch` call time, after every command `const` has initialized.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run src/test/patch.test.ts && pnpm typecheck`
Expected: PASS for the full `patch` suite and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/patch.ts src/test/patch.test.ts
git commit -m "feat: support PatchProps object form in patch"
```

---

### Task 3: Document the props form in `README.md`

**Files:**
- Modify: `README.md:439-449` (patch section)
- Modify: `README.md:554-577` (Patch types section)

- [ ] **Step 1: Replace the `patch` section**

Replace the section at lines 439-449 with:

````markdown
#### `patch`

```ts
function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
function patch(...toPatchItems: ToAnyPatchItem[]): Patch;
```

Declares one or more bindings to apply to the same element. Must be interpolated in an attribute position. Each command (`id`, `val`, `attr`, ...) receives either a plain value (applied once) or a `Sig` (applied on mount and re-applied on change).

```ts
html`<input ${patch(val(name), attr(placeholder, 'name'))} />`;
```

The first argument may instead be a `PatchProps` object, which is desugared into the commands below in key order:

| Props key | Command |
| --- | --- |
| `id` | `id` |
| `val` | `val` |
| `class` | `toggleClass` per entry |
| `style` | `style` per entry |
| `styleProp` | `styleProp` per entry |
| `on` | `on` per entry |
| any other | `attr` |

Values may be plain or `Sig`. A key whose value is `undefined` is skipped. Arbitrary attributes are always set with `setAttribute(key, String(value))`; `patch({disabled: false})` sets `disabled="false"`.

```ts
html`<input ${patch({val: name, placeholder: 'name'})} />`;
```

A props object can be combined with commands; props are applied first, then the items:

```ts
html`<canvas ${patch({id: 'chart'}, act(frame, draw))}></canvas>`;
```
````

- [ ] **Step 2: Add `PatchProps` to the Patch types section**

Immediately after the `Patch` interface code block (ends at line 577) and before its explanation paragraph, insert:

````markdown
#### `PatchProps`

```ts
type Reactive<T> = T | Sig<T>;

interface PatchProps {
  id?: Reactive<string>;
  val?: Reactive<string>;
  class?: Record<string, Reactive<boolean>>;
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  styleProp?: Record<string, Reactive<string>>;
  on?: {[K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void};
  [attr: string]: unknown;
}
```
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document PatchProps object form"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. (The `patch` suite includes `id`/`val`/`attr`/`style`/`styleProp`/`toggleClass`/`act`/`on` plus the new `props:` cases.)

- [ ] **Step 2: Build to validate declaration output**

Run: `pnpm build`
Expected: build succeeds and `dist/sigula.d.ts` exports `patch`, `PatchProps`, `styleProp`. This step may rewrite `package.json`'s `exports`/`publint` fields through tsdown; confirm `git diff` shows only expected changes and revert unrelated churn if any.

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `patch({...})` and `patch({...}, ...items)` type-check and behave as specified.
- `patch(...items)` and `patch()` are unchanged.
- Reactive values in every supported position update and detach through the existing mechanism.
- `styleProperty` is gone; `styleProp` is used in source, tests, and README.
- `pnpm test` and `pnpm typecheck` pass.
