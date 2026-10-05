# Patch Key-First Argument Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the keyed patch commands take the key/token(s) first: `attr(key, source)`, `style(key, source)`, `styleProp(key, source)`, `toggleClass(token, source)`, `toggleClasses(tokens, source)`.

**Architecture:** This is a mechanical, hard breaking reorder. Each command factory in `src/patch.ts` swaps its two parameters; the runtime command bodies, `_toPatchItem`, `PatchContext`, `Patch`, and `E4` are unchanged. `_propsToItems` emits the new order. All call sites (tests, README, one example) are updated. No aliases, no version bump.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, tsdown.

Spec: `docs/superpowers/specs/2026-10-05-patch-arg-order-design.md`

---

## Files

- Modify: `src/patch.ts` — five factory signatures and `_propsToItems`.
- Modify: `src/test/patch.test.ts` — call sites.
- Modify: `src/test/html.test.ts` — call sites.
- Modify: `README.md` — signature blocks and examples.
- Modify: `examples/filtertodos/src/main.ts` — one `style(...)` call.

---

### Task 1: Reorder the command factories and update the tests

**Files:**
- Modify: `src/patch.ts`
- Test: `src/test/patch.test.ts`, `src/test/html.test.ts`

- [ ] **Step 1: Reorder the five factories in `src/patch.ts`**

Replace each of these blocks.

`attr` (currently `source` first):

```ts
export const attr = <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  _toPatchItem(source, [key], attrCmd);
```

with:

```ts
export const attr = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, [key], attrCmd);
```

`style`:

```ts
export const style = <T>(
  source: T | Sig<T>,
  key: WritableStyleKey,
): ToPatchItem<T> => _toPatchItem(source, [key], styleCmd);
```

with:

```ts
export const style = <T>(
  key: WritableStyleKey,
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [key], styleCmd);
```

`styleProp`:

```ts
export const styleProp = <T>(source: T | Sig<T>, key: string): ToPatchItem<T> =>
  _toPatchItem(source, [key], stylePropCmd);
```

with:

```ts
export const styleProp = <T>(key: string, source: T | Sig<T>): ToPatchItem<T> =>
  _toPatchItem(source, [key], stylePropCmd);
```

`toggleClass`:

```ts
export const toggleClass = <T>(
  source: T | Sig<T>,
  token: string,
): ToPatchItem<T> => _toPatchItem(source, [token], toggleClassCmd);
```

with:

```ts
export const toggleClass = <T>(
  token: string,
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [token], toggleClassCmd);
```

`toggleClasses`:

```ts
export const toggleClasses = <T>(
  source: T | Sig<T>,
  ...tokens: string[]
): ToPatchItem<T> => _toPatchItem(source, tokens, toggleClassesCmd);
```

with:

```ts
export const toggleClasses = <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
): ToPatchItem<T> => _toPatchItem(source, [...tokens], toggleClassesCmd);
```

Do not touch `id`, `val`, `act`, `on`, the `*Cmd` bodies, `_toPatchItem`, or `_key`.

- [ ] **Step 2: Update `_propsToItems` in `src/patch.ts`**

Make these four replacements inside `_propsToItems`:

```ts
          if (v !== undefined) items.push(toggleClass(v, token));
```
→
```ts
          if (v !== undefined) items.push(toggleClass(token, v));
```

```ts
          if (v !== undefined) items.push(style(v, name as WritableStyleKey));
```
→
```ts
          if (v !== undefined) items.push(style(name as WritableStyleKey, v));
```

```ts
          if (v !== undefined) items.push(styleProp(v, name));
```
→
```ts
          if (v !== undefined) items.push(styleProp(name, v));
```

```ts
        items.push(attr(value, key));
```
→
```ts
        items.push(attr(key, value));
```

- [ ] **Step 3: Update the call sites in `src/test/patch.test.ts`**

Make these replacements (each is a distinct line):

```ts
    render(html`<div ${patch(attr(s, 'data-color'))}></div>`, document.body);
```
→
```ts
    render(html`<div ${patch(attr('data-color', s))}></div>`, document.body);
```

```ts
    render(html`<div ${patch(style(s, 'color'))}></div>`, document.body);
```
→
```ts
    render(html`<div ${patch(style('color', s))}></div>`, document.body);
```

```ts
    render(html`<div ${patch(styleProp(s, '--size'))}></div>`, document.body);
```
→
```ts
    render(html`<div ${patch(styleProp('--size', s))}></div>`, document.body);
```

```ts
    render(html`<div ${patch(toggleClass(s, 'on'))}></div>`, document.body);
```
→
```ts
    render(html`<div ${patch(toggleClass('on', s))}></div>`, document.body);
```

```ts
      html`<div ${patch(toggleClasses(s, 'a', 'b'))}></div>`,
```
→
```ts
      html`<div ${patch(toggleClasses(['a', 'b'], s))}></div>`,
```

```ts
    const item = attr('x', 'k')(node);
```
→
```ts
    const item = attr('k', 'x')(node);
```

```ts
      html`<div ${patch(id(s), attr(s, 'data-x'))}></div>`;
```
→
```ts
      html`<div ${patch(id(s), attr('data-x', s))}></div>`;
```

```ts
      html`<div ${patch({id: 'a'}, attr(s, 'data-x'))}></div>`,
```
→
```ts
      html`<div ${patch({id: 'a'}, attr('data-x', s))}></div>`,
```

Leave the `props:` tests unchanged (they use the `PatchProps` object form). `act(s, fn)` and `on('click', handler)` stay as they are.

- [ ] **Step 4: Update the call sites in `src/test/html.test.ts`**

```ts
      html`<td>${live ? patch(toggleClass(sig('on'), 'hot')) : text('-')}</td>`;
```
→
```ts
      html`<td>${live ? patch(toggleClass('hot', sig('on'))) : text('-')}</td>`;
```

Both occurrences of:

```ts
      render(html(strs, ...sigs.map((s) => patch(attr(s, 'data-v')))), host);
```
→
```ts
      render(html(strs, ...sigs.map((s) => patch(attr('data-v', s)))), host);
```

(There are two identical lines; replace both.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run src/test/patch.test.ts src/test/html.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS (existing totals).

- [ ] **Step 7: Commit**

```bash
git add src/patch.ts src/test/patch.test.ts src/test/html.test.ts
git commit -m "refactor!: key-first argument order for patch commands"
```

---

### Task 2: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Quick Start `style(...)` example**

Replace:

```
          style(
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
            'textDecoration',
          ),
```

with:

```
          style(
            'textDecoration',
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
          ),
```

- [ ] **Step 2: Update the `patch` section example**

Replace:

```ts
html`<input ${patch(val(name), attr(placeholder, 'name'))} />`;
```

with:

```ts
html`<input ${patch(val(name), attr('name', placeholder))} />`;
```

- [ ] **Step 3: Update the command signature blocks**

`attr`:

```ts
const attr: <T>(source: T | Sig<T>, key: string) => ToPatchItem<T>;
```
→
```ts
const attr: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
```

`style`:

```ts
const style: <T>(
  source: T | Sig<T>,
  key: WritableStyleKey,
) => ToPatchItem<T>;
```
→
```ts
const style: <T>(
  key: WritableStyleKey,
  source: T | Sig<T>,
) => ToPatchItem<T>;
```

`styleProp`:

```ts
const styleProp: <T>(source: T | Sig<T>, key: string) => ToPatchItem<T>;
```
→
```ts
const styleProp: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
```

`toggleClass`:

```ts
const toggleClass: <T>(source: T | Sig<T>, token: string) => ToPatchItem<T>;
```
→
```ts
const toggleClass: <T>(token: string, source: T | Sig<T>) => ToPatchItem<T>;
```

`toggleClasses`:

```ts
const toggleClasses: <T>(
  source: T | Sig<T>,
  ...tokens: string[]
) => ToPatchItem<T>;
```
→
```ts
const toggleClasses: <T>(
  tokens: readonly string[],
  source: T | Sig<T>,
) => ToPatchItem<T>;
```

- [ ] **Step 4: Update the command examples**

```ts
html`<span ${patch(style(color, 'color'))}>text</span>`;
```
→
```ts
html`<span ${patch(style('color', color))}>text</span>`;
```

```ts
html`<div ${patch(styleProp(size, '--size'))}></div>`;
```
→
```ts
html`<div ${patch(styleProp('--size', size))}></div>`;
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: key-first patch command arguments"
```

---

### Task 3: Update the example app

> **Reverted:** during execution the example was reverted. `examples/filtertodos`
> is a standalone project pinned to the released `sigula@1.0.3`, so it stays on
> the old order to keep compiling against its dependency, and will be updated
> when the next version is released. See the spec's "Scope of the change".

**Files:**
- Modify: `examples/filtertodos/src/main.ts`

- [ ] **Step 1: Update the `style(...)` call**

Replace:

```
          style(
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
            'textDecoration',
          ),
```

with:

```
          style(
            'textDecoration',
            compute(item.done, (v): string => (v ? 'line-through' : 'none')),
          ),
```

- [ ] **Step 2: Commit**

```bash
git add examples/filtertodos/src/main.ts
git commit -m "docs: update example to key-first patch arguments"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Confirm no old-order call sites remain**

Run:

```bash
rg -n "\b(attr|style|styleProp|toggleClass|toggleClasses)\(" --glob '!node_modules' --glob '!dist' -g '!*.map' .
```

Inspect each hit: the key/token argument must come before the source. The only
remaining matches should be the signatures/definitions themselves and the
`style(`/`attr(` inside prose or `PatchProps` (which is unchanged). No call may
pass a `Sig`/reactive value as the first argument and a string key as the second.

- [ ] **Step 3: Build to validate declaration output**

Run: `pnpm build`
Expected: build succeeds and `dist/sigula.d.ts` shows the key-first signatures.

- [ ] **Step 4: Confirm the spec's acceptance criteria**

- `attr`/`style`/`styleProp`/`toggleClass`/`toggleClasses` take key(s) first.
- `id`, `val`, `act`, `on`, `patch`, and `PatchProps` are unchanged.
- `_propsToItems` emits the new order and props behavior is unchanged.
- All tests and typecheck pass, and no old-order call sites remain.
