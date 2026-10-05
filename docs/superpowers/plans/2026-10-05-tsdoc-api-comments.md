# TSDoc API Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TSDoc block to every export in `src/` (and member-level docs on exported interfaces/classes), mirroring the README Reference, so an API reference can later be generated from source.

**Architecture:** Comments only — no runtime or type changes. Each exported symbol gets a TSDoc block with a summary, applicable `@param`/`@typeParam`/`@returns`/`@example`/`@defaultValue`, and a `@group`. Exported interfaces/classes get member-level docs. Existing `// biome-ignore` lines stay immediately above the declaration they suppress, with TSDoc placed above the ignore comment. `@example` fences use ` ```ts `.

**Tech Stack:** TypeScript (strict), tsdown (type emit preserves JSDoc), vitest.

Spec: `docs/superpowers/specs/2026-10-05-tsdoc-api-comments-design.md`

---

## Rules for every task

- Add the block directly above the export.
- If a `// biome-ignore ...` comment currently sits immediately above the export, put the TSDoc block above the `// biome-ignore` line.
- Use exactly one of these `@group` values: `Reactivity`, `Templates`, `DOM bindings`, `Control flow`, `Rendering`, `Low-level API`.
- Do not change any signature, body, or type.
- **Member snippets are placement guides.** Where a step lists members (for example `get(): T`), it shows only the comment line and the existing declaration line so you know which comment goes where. Add the comment above the member in the real file; do not replace, reformat, or drop the existing declaration, braces, or method bodies.
- After each task run `pnpm typecheck` (comments are type-checked) and the relevant tests if any, then commit.

---

### Task 1: Reactions core — `src/core/sig.bind.ts`

**Files:** Modify `src/core/sig.bind.ts`.

- [ ] **Step 1: Document `Bind`, `AnyBind`, `Sig`, `DerivedSig`, `sig`, `createBind`, `removeBind`, `Reactive`.**

`Bind` (above the interface):

````ts
/**
 * A registered binding: the signal, its command context, and the command that
 * runs when the signal changes.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @group Reactivity
 */
````

Its members:

````ts
  /** The signal this binding observes. */
  sig: Sig<T>;
  /** The context passed to `cmd` on each run. */
  context: C;
  /** The command run with the current value and context. */
  cmd: Cmd<T, C>;
  /** Set when the binding is detached; a removed binding is skipped. */
  removed: boolean;
  /** Queue flag; true while the binding is queued for the next flush. */
  queued?: boolean;
````

`AnyBind` (put the TSDoc above the existing `// biome-ignore` line):

````ts
/**
 * A {@link Bind} with erased value and context types.
 *
 * @group Reactivity
 */
````

`Sig` class:

````ts
/**
 * The core reactive value. A `Sig` holds a value and a set of bindings that run
 * when it changes; writes are queued and coalesced in a microtask.
 *
 * @typeParam T - the value type.
 * @group Reactivity
 */
````

`Sig` members:

````ts
  /** Reads the current value. */
  get(): T

  /** Enqueues dependents without changing the value; use after in-place mutation. */
  notify()

  /** Sets the value and always notifies dependents, even when deeply equal. */
  forceUpdate(v: T)

  /** Sets the value and notifies dependents only when `eq(v, current)` is false. */
  update(v: T)

  /** Applies `fn` to the current value via `update`, so an equal result is skipped. */
  trans(fn: (v: T) => T)

  /** `Equatable` implementation; two `Sig`s are equal when their values are deeply equal. */
  equals(b: unknown)

  /** Registers a binding. Prefer `createBind` or the `patch`/`text`/`view` APIs. */
  addBind<C extends CmdContext>(bind: Bind<T, C>)

  /** Unregisters a binding; runs `cleanup()` when the last one goes away. */
  removeBind<C extends CmdContext>(bind: Bind<T, C>)

  /** Returns the current bindings. */
  getBinds(): Bind<T, CmdContext>[]

  /** Overridable hook called when a signal loses all bindings. No-op on `Sig`. */
  cleanup()
````

`DerivedSig` class:

````ts
/**
 * A `Sig` produced by {@link compute}. Extends `Sig` and additionally tracks the
 * source bindings that feed it: it detaches from its sources when it loses its
 * last consumer, and re-links and recomputes once when a consumer is added
 * again.
 *
 * @typeParam T - the derived value type.
 * @group Reactivity
 */
````

`DerivedSig` members:

````ts
  /** Registers a source binding. */
  addFromBind<S, C extends CmdContext>(bind: Bind<S, C>)

  /** Registers a consumer; re-links to sources and recomputes once if detached. */
  override addBind<C extends CmdContext>(bind: Bind<T, C>)

  /** Removes every source binding when the derived signal has no consumers. */
  override cleanup()
````

`sig`:

````ts
/**
 * Creates a writable signal holding `v`.
 *
 * @param v - the initial value.
 * @returns a new `Sig` for `v`.
 * @example
 * ```ts
 * const count = sig(0);
 * count.get();     // 0
 * count.update(1); // schedules dependents
 * ```
 * @group Reactivity
 */
````

`createBind`:

````ts
/**
 * Wires `cmd(sig.get(), context)` to run whenever `sig` changes.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @param sig - the signal to observe.
 * @param context - the context passed to `cmd`.
 * @param cmd - the command run on change.
 * @returns the registered binding.
 * @group Reactivity
 */
````

`removeBind`:

````ts
/**
 * Detaches a binding and marks it removed so queued runs are skipped.
 *
 * @typeParam T - the signal's value type.
 * @typeParam C - the command context type.
 * @param bind - the binding to remove.
 * @group Reactivity
 */
````

`Reactive`:

````ts
/**
 * A value that may be plain, a `Sig`, or `undefined`.
 *
 * @typeParam T - the underlying value type.
 * @group Reactivity
 */
````

- [ ] **Step 2: Verify and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/core/sig.bind.ts
git commit -m "docs: add TSDoc to reactivity core"
```

---

### Task 2: `src/core/eq.ts` and `src/core/compute.ts`

**Files:** Modify `src/core/eq.ts`, `src/core/compute.ts`.

- [ ] **Step 1: Document `eq.ts`.**

`Equatable`:

````ts
/**
 * Implement this on a value type to give `eq` custom equality semantics.
 *
 * @group Reactivity
 */
````

with its member:

````ts
  /** Returns whether `this` and `other` are equal. */
  equals(other: unknown): boolean;
````

`Eq`:

````ts
/**
 * A value equality function.
 *
 * @typeParam T - the value type.
 * @group Reactivity
 */
````

`UnknownRecord`:

````ts
/**
 * Convenience alias for an arbitrary string-keyed object.
 *
 * @group Reactivity
 */
````

`eq`:

````ts
/**
 * Deep structural equality. Compares primitives, arrays, `Date`, `RegExp`,
 * `Map`, `Set`, and plain objects, and defers to `a.equals(b)` when `a`
 * implements `Equatable`. This is the default comparator for `Sig.update` and
 * `repeat`. Values with different prototypes are never equal.
 *
 * @typeParam T - the value type.
 * @param a - the first value.
 * @param b - the second value.
 * @returns `true` when `a` and `b` are deeply equal.
 * @group Reactivity
 */
````

- [ ] **Step 2: Document `compute.ts`.**

`SigRecord` (above the existing `// biome-ignore` that guards the index signature):

````ts
/**
 * A record whose values are signals, used by the record overload of
 * {@link compute}.
 *
 * @group Reactivity
 */
````

`ValRecord`:

````ts
/**
 * Maps a {@link SigRecord} to a record of the signals' values.
 *
 * @typeParam K - the signal record type.
 * @group Reactivity
 */
````

`compute` first overload:

````ts
/**
 * Derives a signal from one source signal. The result recomputes whenever
 * `source` changes.
 *
 * @typeParam S - the source value type.
 * @typeParam T - the derived value type.
 * @param source - the source signal.
 * @param fn - maps the source value to the derived value.
 * @returns a `DerivedSig` for the mapped value.
 * @example
 * ```ts
 * const x = sig(1);
 * const doubled = compute(x, (v) => v * 2);
 * ```
 * @group Reactivity
 */
````

`compute` second (record) overload:

````ts
/**
 * Derives a signal from a record of signals; `fn` receives the matching record
 * of values. The result recomputes whenever any source changes.
 *
 * @typeParam S - the signal record type.
 * @typeParam T - the derived value type.
 * @param source - a record of signals.
 * @param fn - maps the record of values to the derived value.
 * @returns a `DerivedSig` for the mapped value.
 * @example
 * ```ts
 * const sum = compute({x, y}, (v) => v.x + v.y);
 * ```
 * @group Reactivity
 */
````

Leave the implementation signature's existing `// biome-ignore` line and add no doc to it.

- [ ] **Step 3: Verify and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/core/eq.ts src/core/compute.ts
git commit -m "docs: add TSDoc to eq and compute"
```

---

### Task 3: `src/core/cmd.ts` and `src/core/patch.core.ts`

**Files:** Modify `src/core/cmd.ts`, `src/core/patch.core.ts`.

- [ ] **Step 1: Document `cmd.ts`.**

`CmdContext`:

````ts
/**
 * Base type for command contexts: an arbitrary string-keyed record.
 *
 * @group Low-level API
 */
````

`Cmd`:

````ts
/**
 * The unit of work a binding runs: it receives the current value and context.
 *
 * @typeParam T - the value type.
 * @typeParam C - the context type.
 * @group Low-level API
 */
````

`AnyCmd` (above its `// biome-ignore`):

````ts
/**
 * A {@link Cmd} with erased value and context types.
 *
 * @group Low-level API
 */
````

- [ ] **Step 2: Document `patch.core.ts`.**

`Patch`:

````ts
/**
 * A collection of deferred bindings to apply to one element, produced by
 * {@link patch}.
 *
 * @group DOM bindings
 */
````

with members:

````ts
  /** Discriminant identifying a patch. */
  type: 'patch';
  /** Deferred patch-item factories, resolved against the target element on mount. */
  toPatchItems: ToAnyPatchItem[];
  /** Detaches the bindings created when the patch was committed. */
  cleanBinds: () => void;
````

`PatchContext`:

````ts
/**
 * Context passed to patch commands: the target node plus any extra arguments.
 *
 * @group DOM bindings
 */
````

with members:

````ts
  /** The element the binding applies to. */
  node: Node;
  /** Extra arguments for the command, such as the attribute or style key. */
  extra?: unknown[];
````

`PatchItem`:

````ts
/**
 * One resolved patch binding: a source value, its context, and the command.
 *
 * @typeParam T - the source value type.
 * @group DOM bindings
 */
````

with members:

````ts
  /** The plain value or `Sig` the command binds. */
  source: T | Sig<T>;
  /** The context passed to `cmd`. */
  context: PatchContext;
  /** The command run with the value and context. */
  cmd: Cmd<T, PatchContext>;
````

`ToPatchItem`:

````ts
/**
 * A factory that defers reading the target element until mount.
 *
 * @typeParam T - the source value type.
 * @group DOM bindings
 */
````

`AnyPatchItem` (above its `// biome-ignore`):

````ts
/**
 * A {@link PatchItem} with an erased value type.
 *
 * @group DOM bindings
 */
````

`ToAnyPatchItem`:

````ts
/**
 * A {@link ToPatchItem} with an erased value type.
 *
 * @group DOM bindings
 */
````

- [ ] **Step 3: Verify and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/core/cmd.ts src/core/patch.core.ts
git commit -m "docs: add TSDoc to cmd and patch types"
```

---

### Task 4: `src/core/view.core.ts`, `boundary.ts`, `utils.ts`, `err.ts`

**Files:** Modify `src/core/view.core.ts`, `src/core/boundary.ts`, `src/core/utils.ts`, `src/core/err.ts`.

- [ ] **Step 1: Document `view.core.ts`.**

`ChildView`:

````ts
/**
 * An item that can occupy a slot in a view's children: a view or a patch.
 *
 * @group Templates
 */
````

`View` (above its `// biome-ignore`):

````ts
/**
 * The unit returned by `html`, `text`, `raw`, `view`, `repeat`, `list`, and
 * `frag`.
 *
 * @typeParam T - the bound value type.
 * @typeParam C - the bind context type.
 * @group Templates
 */
````

with members:

````ts
  /** Discriminant identifying a view. */
  type: 'view';
  /** The DOM node or `DocumentFragment` the view occupies. */
  node: Node;
  /** The view's own binding, when it is reactive. */
  bind?: Bind<T, C> | undefined;
  /** Detaches the view's bindings and, recursively, those of its children. */
  cleanBinds: () => void;
  /** Returns the nodes the view currently occupies. */
  boundary: () => Boundary;
  /** The interpolated children of a template view. */
  children?: ChildView[] | undefined;
````

`AnyView` (above its `// biome-ignore`):

````ts
/**
 * A {@link View} with erased value and context types.
 *
 * @group Templates
 */
````

`ViewContext`:

````ts
/**
 * Context for the `view` command: the current inner view and the view factory.
 *
 * @typeParam T - the value type.
 * @group Templates
 */
````

with members:

````ts
  /** The currently mounted inner view. */
  inner: AnyView;
  /** Builds the next inner view from a new value. */
  viewFn: (val: T) => AnyView;
````

`replaceWithView`:

````ts
/**
 * Replaces an existing boundary with a view's node and returns the new boundary.
 *
 * @param old - the boundary to replace.
 * @param view - the view to mount.
 * @returns the boundary of the mounted view.
 * @group Templates
 */
````

- [ ] **Step 2: Document `boundary.ts`.**

`Boundary`:

````ts
/**
 * An inclusive range of sibling nodes (`start` through `end`).
 *
 * @group Low-level API
 */
````

with members:

````ts
  /** The first node in the range. */
  start: Node;
  /** The last node in the range. */
  end: Node;
````

`walkBoundary`:

````ts
/**
 * Visits every node from `b.start` through `b.end`.
 *
 * @param b - the boundary to walk.
 * @param fn - called with each node.
 * @group Low-level API
 */
````

`removeBoundary`:

````ts
/**
 * Removes every node in the boundary. No-op if the boundary has no parent.
 *
 * @param b - the boundary to remove.
 * @group Low-level API
 */
````

`toBoundary`:

````ts
/**
 * Wraps a node in a {@link Boundary}. A `DocumentFragment` spans its first and
 * last child; any other node covers itself. Throws `E2` on an empty fragment.
 *
 * @param node - the node to wrap.
 * @returns the node's boundary.
 * @group Low-level API
 */
````

`replaceWithNode`:

````ts
/**
 * Replaces an entire boundary with `node` and returns the new boundary. Throws
 * `E3` if the old boundary has no parent.
 *
 * @param old - the boundary to replace.
 * @param node - the replacement node.
 * @returns the boundary of the inserted node.
 * @group Low-level API
 */
````

- [ ] **Step 3: Document `utils.ts` and `err.ts`.**

`at`:

````ts
/**
 * Reads `arr[index]`, throwing `E1:<index>` when it is out of range.
 *
 * @typeParam T - the element type.
 * @param arr - the array to read from.
 * @param index - the index to read.
 * @returns the element at `index`.
 * @group Low-level API
 */
````

`err`:

````ts
/**
 * Throws an `Error` whose message is the short `code` (for example `E2` or
 * `E11:1:2`). The full text for each code lives in the README error table, so
 * string tables stay out of the bundle.
 *
 * @param code - the coded error message.
 * @group Low-level API
 */
````

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/core/view.core.ts src/core/boundary.ts src/core/utils.ts src/core/err.ts
git commit -m "docs: add TSDoc to view, boundary, utils, and err"
```

---

### Task 5: Templates — `src/html.ts`, `src/text.ts`, `src/raw.ts`

**Files:** Modify `src/html.ts`, `src/text.ts`, `src/raw.ts`.

- [ ] **Step 1: Document `html`.**

````ts
/**
 * Tagged template that parses native HTML and returns a {@link View}. Three
 * kinds of interpolation are supported:
 *
 * - a `View` fills a content position;
 * - a `Patch` (from `patch(...)`) fills an attribute position;
 * - a plain value or a `Sig` fills a content position as text — a `Sig` binds
 *   reactively and any other value becomes `String(value)`.
 *
 * Templates are cached per call site, so repeated renders skip parsing. Throws
 * `E10` for an empty template, `E11:<expected>:<got>` for an interpolation-count
 * mismatch, and `E12` for an unmatched interpolation (a `patch` in content
 * position, or a text value in an attribute position).
 *
 * @param strs - the static template strings.
 * @param rawItems - the interpolated views, patches, or text values.
 * @returns the parsed `View`.
 * @example
 * ```ts
 * html`<p>Hello, ${name}!</p>`;
 * html`<button ${patch(on('click', handler))}>Go</button>`;
 * ```
 * @group Templates
 */
````

- [ ] **Step 2: Document `text`.**

````ts
/**
 * Creates a text-node view. With a `Sig`, the text updates whenever the signal
 * changes; a plain value is static.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a text `View`.
 * @example
 * ```ts
 * html`<span>${text(count)}</span>`;
 * ```
 * @group Templates
 */
````

- [ ] **Step 3: Document `raw`.**

````ts
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
````

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

```bash
git add src/html.ts src/text.ts src/raw.ts
git commit -m "docs: add TSDoc to template primitives"
```

---

### Task 6: DOM bindings — `src/patch.ts`

**Files:** Modify `src/patch.ts`.

- [ ] **Step 1: Document `patch` (both overloads).**

First overload:

````ts
/**
 * Declares one or more bindings to apply to the same element; must be
 * interpolated in an attribute position. Each command receives a plain value
 * (applied once) or a `Sig` (applied on mount and re-applied on change).
 *
 * The first argument may be a {@link PatchProps} object, desugared into the
 * commands below in key order, optionally followed by command items.
 *
 * @param props - a props object.
 * @param items - command items applied after the props.
 * @returns a `Patch` for `html` to commit.
 * @example
 * ```ts
 * html`<input ${patch({val: name, placeholder: 'name'})} />`;
 * ```
 * @group DOM bindings
 */
````

Second overload:

````ts
/**
 * Declares one or more command bindings to apply to the same element.
 *
 * @param toPatchItems - the command items to apply.
 * @returns a `Patch` for `html` to commit.
 * @example
 * ```ts
 * html`<input ${patch(val(name), attr('name', placeholder))} />`;
 * ```
 * @group DOM bindings
 */
````

- [ ] **Step 2: Document `PatchProps`.**

````ts
/**
 * Object form for {@link patch}, desugared into commands in key order:
 * `id`, `val`, `class` (per entry, via `toggleClass`), `style` (per entry,
 * via `style`), `styleProp` (per entry), `on` (per entry), and any other key
 * via `attr`. A key whose value is `undefined` is skipped.
 *
 * @group DOM bindings
 */
````

with members:

````ts
  /** Sets the element's `id`. */
  id?: Reactive<string>;
  /** Sets the element's `value` property. */
  val?: Reactive<string>;
  /** Toggles each class from the truthiness of its value. */
  class?: Record<string, Reactive<boolean>>;
  /** Sets inline style properties by typed name. */
  style?: Partial<Record<WritableStyleKey, Reactive<string>>>;
  /** Sets style properties via `setProperty` (custom properties, untyped names). */
  styleProp?: Record<string, Reactive<string>>;
  /** Registers DOM event listeners. */
  on?: {
    [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
  };
  /** Any other key is set as an attribute via `attr`. */
  [attr: string]: unknown;
````

- [ ] **Step 3: Document `id`, `val`, `attr`, `WritableStyleKey`, `style`, `styleProp`, `toggleClass`, `toggleClasses`, `ActFn`, `act`, `on`.**

`id`:

````ts
/**
 * Sets the element's `id`.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

`val`:

````ts
/**
 * Sets the element's `value` property (form controls).
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

`attr`:

````ts
/**
 * Sets attribute `key`. Use this for boolean/ARIA/data attributes.
 *
 * @typeParam T - the value type.
 * @param key - the attribute name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

`WritableStyleKey`:

````ts
/**
 * The union of `CSSStyleDeclaration` keys whose values are strings.
 *
 * @group DOM bindings
 */
````

`style`:

````ts
/**
 * Sets an inline style property by typed name.
 *
 * @typeParam T - the value type.
 * @param key - the typed style property name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<span ${patch(style('color', color))}>text</span>`;
 * ```
 * @group DOM bindings
 */
````

`styleProp`:

````ts
/**
 * Sets a style property via `CSSStyleDeclaration.setProperty`; use this for
 * custom properties (`--my-var`) or untyped names.
 *
 * @typeParam T - the value type.
 * @param key - the style property name.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<div ${patch(styleProp('--size', size))}></div>`;
 * ```
 * @group DOM bindings
 */
````

`toggleClass`:

````ts
/**
 * Toggles a single class from the truthiness of the value.
 *
 * @typeParam T - the value type.
 * @param token - the class token.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

`toggleClasses`:

````ts
/**
 * Toggles several classes from one value.
 *
 * @typeParam T - the value type.
 * @param tokens - the class tokens.
 * @param source - a plain value or a `Sig`.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

`ActFn`:

````ts
/**
 * A custom patch callback run on mount and on change.
 *
 * @typeParam T - the value type.
 * @group DOM bindings
 */
````

`act`:

````ts
/**
 * Runs arbitrary code with the bound node and value, on mount and again on
 * change. The escape hatch for anything the built-in commands do not cover.
 *
 * @typeParam T - the value type.
 * @param source - a plain value or a `Sig`.
 * @param fn - called with the node and current value.
 * @returns a deferred patch item.
 * @example
 * ```ts
 * html`<canvas ${patch(act(frame, (node, v) => draw(node, v)))}></canvas>`;
 * ```
 * @group DOM bindings
 */
````

`on`:

````ts
/**
 * Adds a DOM event listener. The listener is registered once at mount and is
 * not a reactive source; combine it with `sig` writes to drive updates.
 *
 * @typeParam K - the event type.
 * @param type - the event name.
 * @param listener - the event listener.
 * @param options - standard `addEventListener` options.
 * @returns a deferred patch item.
 * @group DOM bindings
 */
````

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

```bash
git add src/patch.ts
git commit -m "docs: add TSDoc to DOM binding commands"
```

---

### Task 7: Control flow + rendering — `src/view.ts`, `repeat.ts`, `list.ts`, `frag.ts`, `render.ts`

**Files:** Modify `src/view.ts`, `src/repeat.ts`, `src/list.ts`, `src/frag.ts`, `src/render.ts`.

- [ ] **Step 1: Document `view`.**

````ts
/**
 * Conditionally renders one view or another. Whenever `sig` changes, `viewFn`
 * runs with the new value, the previous view is torn down, and a new one is
 * mounted in its place.
 *
 * @typeParam T - the value type.
 * @param sig - the signal to switch on.
 * @param viewFn - builds the view for a value.
 * @returns a `View` that swaps its contents.
 * @example
 * ```ts
 * html`<div>${view(isEmpty, (v) => (v ? text('empty') : listView))}</div>`;
 * ```
 * @group Control flow
 */
````

- [ ] **Step 2: Document `repeat.ts`.**

`RepeatProp`:

````ts
/**
 * Options for {@link repeat}.
 *
 * @typeParam T - the item type.
 * @group Control flow
 */
````

with members:

````ts
  /** Returns the unique, stable key for an item. */
  key: (item: T) => string;
  /** Builds the view for an item. */
  view: (item: T) => AnyView;
  /** Item comparator; defaults to `eq`. */
  eq?: (a: T, b: T) => boolean;
````

`RepeatContext`:

````ts
/**
 * Context for the `repeat` command.
 *
 * @typeParam T - the item type.
 * @group Control flow
 */
````

with members:

````ts
  /** The repeat options. */
  prop: RepeatProp<T>;
  /** The current node boundary. */
  boundary: Boundary;
  /** The tracked items and their views. */
  tracks: Track<T>[];
````

`repeat`:

````ts
/**
 * Keyed list rendering. On each change `repeat` matches items by `key`, then
 * reuses, moves, creates, or removes as few DOM nodes as possible. The item
 * comparator defaults to `eq`; when an item is deeply equal to the track it
 * already occupies, the track is reused without rebuilding its view. An empty
 * array renders `<!--empty-list-->`.
 *
 * @typeParam T - the item type.
 * @param sig - the signal holding the items.
 * @param prop - the key/view/eq options.
 * @returns a `View` rendering the list.
 * @example
 * ```ts
 * html`<ul>${repeat(todos, {
 *   key: (item) => item.id.toString(),
 *   view: (item) => html`<li>${text(item.label)}</li>`,
 * })}</ul>`;
 * ```
 * @group Control flow
 */
````

- [ ] **Step 3: Document `list`.**

````ts
/**
 * Renders a fixed array in order. `viewFn` is called once per item with the item
 * and its 0-based index, and each returned `AnyView` is appended in sequence.
 * There is no keying or reconciliation and no reactive source; any reactivity
 * comes from the views `viewFn` returns. An empty array renders
 * `<!--empty-list-->`.
 *
 * @typeParam T - the item type.
 * @param items - the items to render.
 * @param viewFn - builds the view for an item and its index.
 * @returns a `View` rendering the items.
 * @example
 * ```ts
 * html`<ul>${list(items, (item, i) => html`<li>${i}: ${text(item)}</li>`)}</ul>`;
 * ```
 * @group Control flow
 */
````

- [ ] **Step 4: Document `frag`.**

````ts
/**
 * Composes several views into one content-position view. The views' nodes are
 * inserted as flat siblings, in order, with no wrapper element; nested
 * fragments flatten. Reactivity comes from the child views. `frag()` with no
 * arguments renders nothing.
 *
 * @param views - the views to compose.
 * @returns a `View` rendering the views as siblings.
 * @example
 * ```ts
 * html`<div>${frag(text('a'), html`<b>${text('b')}</b>`)}</div>`;
 * ```
 * @group Control flow
 */
````

- [ ] **Step 5: Document `render`.**

````ts
/**
 * Mounts a view into `node` by appending its `node`. Accepts a `View` directly
 * or a factory function that returns one. Returns a disposer that detaches every
 * bind in the tree and removes the nodes from `node`; calling it twice is a
 * no-op.
 *
 * @param viewArg - the view, or a function returning one.
 * @param node - the node to mount into.
 * @returns a disposer that unmounts the view.
 * @example
 * ```ts
 * const dispose = render(App(), document.querySelector('#app')!);
 * dispose();
 * ```
 * @group Rendering
 */
````

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

```bash
git add src/view.ts src/repeat.ts src/list.ts src/frag.ts src/render.ts
git commit -m "docs: add TSDoc to control flow and render"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole suite, typecheck, and build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 2: Confirm comments survive type emit**

Run: `rg -n "Enqueues dependents without changing the value" dist/sigula.d.ts`
Expected: a match (the `Sig.notify` doc is present in the emitted declaration).

- [ ] **Step 3: Confirm coverage and groups**

Run:

```bash
rg -n "@group (Reactivity|Templates|DOM bindings|Control flow|Rendering|Low-level API)" src
```

Expected: matches across the files edited in Tasks 1–7, and no other `@group`
values. Spot-check that every export listed in the spec's Scope has a TSDoc
block.

- [ ] **Step 4: Confirm the spec's acceptance criteria**

- Every export in the Scope list has a TSDoc block with a summary and applicable
  tags.
- Exported interfaces/classes have member-level TSDoc; overloads document every
  overload.
- Every documented symbol carries one of the six `@group` values.
- No runtime or type behavior changed; `pnpm test` and `pnpm typecheck` pass.
- `dist/sigula.d.ts` is emitted with the comments intact.
