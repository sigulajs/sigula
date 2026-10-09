# Reference

> Generated from the TSDoc comments in `src/`. Do not edit by hand — run `pnpm docs:api`.

### `sig`

```ts
const sig: <T>(v: T, opts?: { eq?: Eq<T>; }) => Sig<T>;
```

Creates a writable signal holding `v`.

**Parameters**

- `v` — the initial value.
- `opts` — optional settings; `eq` overrides the comparator used by `update`.

**Returns** a new `Sig` for `v`.

**Example**

```ts
const count = sig(0);
count.get();     // 0
count.update(1); // schedules dependents
```

### `compute`

```ts
function compute<S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T>;
function compute<S extends SigRecord, T>(source: S, fn: (v: ValRecord<S>) => T): DerivedSig<T>;
```

Derives a signal from one source signal. The result recomputes whenever
`source` changes.

Derives a signal from a record of signals; `fn` receives the matching record
of values. The result recomputes whenever any source changes.

**Type parameters**

- `S` — the source value type.
- `T` — the derived value type.
- `S` — the signal record type.

**Parameters**

- `source` — the source signal.
- `fn` — maps the source value to the derived value.
- `source` — a record of signals.
- `fn` — maps the record of values to the derived value.

**Returns** a `DerivedSig` for the mapped value.

**Example**

```ts
const x = sig(1);
const doubled = compute(x, (v) => v * 2);
```

```ts
const sum = compute({x, y}, (v) => v.x + v.y);
```

### `effect`

```ts
function effect<S>(source: Sig<S>, fn: (v: S) => void): () => void;
function effect<S extends SigRecord>(source: S, fn: (v: ValRecord<S>) => void): () => void;
```

Runs a side effect over one signal: `fn` is called immediately with the
current value and again whenever the signal changes.

Runs a side effect over a record of signals: `fn` is called immediately with
the record of current values and again, once per flush, after any source
changes.

**Type parameters**

- `S` — the source value type.
- `S` — the signal record type.

**Parameters**

- `source` — the signal to observe.
- `fn` — the effect, run with the current value.
- `source` — a record of signals.
- `fn` — the effect, run with the record of current values.

**Returns** a disposer that detaches the effect.

**Example**

```ts
const dispose = effect(count, (v) => console.log(v));
dispose();
```

```ts
const dispose = effect({x, y}, (v) => console.log(v.x + v.y));
```

### `html`

```ts
const html: (strs: TemplateStringsArray, ...rawItems: HtmlItem[]) => View;
```

Tagged template that parses native HTML and returns a `View`. Three
kinds of interpolation are supported:

- a `View` fills a content position;
- a `Patch` (from `patch(...)`) fills an attribute position;
- a plain value or a `Sig` fills a content position as text — a `Sig` binds
  reactively and any other value becomes `String(value)`.

Templates are cached per call site, so repeated renders skip parsing. Throws
`E10` for an empty template, `E11:<expected>:<got>` for an interpolation-count
mismatch, `E12` for an unmatched interpolation (a `patch` in content position,
or a text value in an attribute position), and `E13` when a `View` is committed
more than once.

**Parameters**

- `strs` — the static template strings.
- `rawItems` — the interpolated views, patches, or text values.

**Returns** the parsed `View`.

**Example**

```ts
html`<p>Hello, ${name}!</p>`;
html`<button ${patch(on('click', handler))}>Go</button>`;
```

### `text`

```ts
const text: <T>(source: T | Sig<T>) => View<T, PatchContext>;
```

Creates a text-node view. With a `Sig`, the text updates whenever the signal
changes; a plain value is static.

**Type parameters**

- `T` — the value type.

**Parameters**

- `source` — a plain value or a `Sig`.

**Returns** a text `View`.

**Example**

```ts
html`<span>${text(count)}</span>`;
```

### `raw`

```ts
const raw: (source: string | Sig<string>) => AnyView;
```

Parses its value as HTML and mounts the resulting nodes with no wrapper
element. Unlike `text`, the value is **not** escaped, so only pass trusted
HTML; inline handlers and other vectors still apply once the nodes connect.
A `Sig` re-parses and replaces the content on change; an empty string renders
nothing.

**Parameters**

- `source` — an HTML string or a `Sig` of one.

**Returns** a content-position `View`.

**Example**

```ts
html`<article>${raw(post.bodyHtml)}</article>`;
```

### `patch`

```ts
function patch(props: PatchProps, ...items: ToAnyPatchItem[]): Patch;
function patch(...toPatchItems: ToAnyPatchItem[]): Patch;
```

Declares one or more bindings to apply to the same element; must be
interpolated in an attribute position. Each command receives a plain value
(applied once) or a `Sig` (applied on mount and re-applied on change).

The first argument may be a `PatchProps` object, desugared into the
commands below in key order, optionally followed by command items.

Declares one or more command bindings to apply to the same element.

**Parameters**

- `props` — a props object.
- `items` — command items applied after the props.
- `toPatchItems` — the command items to apply.

**Returns** a `Patch` for `html` to commit.

**Example**

```ts
html`<input ${patch({val: name, placeholder: 'name'})} />`;
```

```ts
html`<input ${patch(val(name), attr('name', placeholder))} />`;
```

### `id`

```ts
const id: <T>(source: T | Sig<T>) => ToPatchItem<T>;
```

Sets the element's `id`.

**Type parameters**

- `T` — the value type.

**Parameters**

- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

### `val`

```ts
const val: <T>(source: T | Sig<T>) => ToPatchItem<T>;
```

Sets the element's `value` property (form controls).

**Type parameters**

- `T` — the value type.

**Parameters**

- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

### `attr`

```ts
const attr: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
```

Sets attribute `key`. Use this for boolean/ARIA/data attributes.

**Type parameters**

- `T` — the value type.

**Parameters**

- `key` — the attribute name.
- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

### `style`

```ts
const style: <T>(key: WritableStyleKey, source: T | Sig<T>) => ToPatchItem<T>;
```

Sets an inline style property by typed name.

**Type parameters**

- `T` — the value type.

**Parameters**

- `key` — the typed style property name.
- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

**Example**

```ts
html`<span ${patch(style('color', color))}>text</span>`;
```

### `styleProp`

```ts
const styleProp: <T>(key: string, source: T | Sig<T>) => ToPatchItem<T>;
```

Sets a style property via `CSSStyleDeclaration.setProperty`; use this for
custom properties (`--my-var`) or untyped names.

**Type parameters**

- `T` — the value type.

**Parameters**

- `key` — the style property name.
- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

**Example**

```ts
html`<div ${patch(styleProp('--size', size))}></div>`;
```

### `toggleClass`

```ts
const toggleClass: <T>(token: string, source: T | Sig<T>) => ToPatchItem<T>;
```

Toggles a single class from the truthiness of the value.

**Type parameters**

- `T` — the value type.

**Parameters**

- `token` — the class token.
- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

### `toggleClasses`

```ts
const toggleClasses: <T>(tokens: readonly string[], source: T | Sig<T>) => ToPatchItem<T>;
```

Toggles several classes from one value.

**Type parameters**

- `T` — the value type.

**Parameters**

- `tokens` — the class tokens.
- `source` — a plain value or a `Sig`.

**Returns** a deferred patch item.

### `on`

```ts
const on: <K extends keyof HTMLElementEventMap>(type: K, listener: _Listener<K>, options?: boolean | AddEventListenerOptions) => ToPatchItem<_Listener<K>>;
```

Adds a DOM event listener. The listener is registered once at mount and is
not a reactive source; combine it with `sig` writes to drive updates.

**Type parameters**

- `K` — the event type.

**Parameters**

- `type` — the event name.
- `listener` — the event listener.
- `options` — standard `addEventListener` options.

**Returns** a deferred patch item.

### `act`

```ts
const act: <T>(source: T | Sig<T>, fn: ActFn<T>) => ToPatchItem<T>;
```

Runs arbitrary code with the bound node and value, on mount and again on
change. The escape hatch for anything the built-in commands do not cover.

**Type parameters**

- `T` — the value type.

**Parameters**

- `source` — a plain value or a `Sig`.
- `fn` — called with the node and current value.

**Returns** a deferred patch item.

**Example**

```ts
html`<canvas ${patch(act(frame, (node, v) => draw(node, v)))}></canvas>`;
```

### `ref`

```ts
const ref: <T extends Element>(target: Sig<T | null>) => ToPatchItem<null>;
```

Captures the patched element into `target` on mount, and resets `target` to
`null` when the patch is torn down. Must be interpolated in an attribute
position.

**Type parameters**

- `T` — the element type.

**Parameters**

- `target` — a signal that receives the element, or `null`.

**Returns** a deferred patch item.

**Example**

```ts
const input = sig<HTMLInputElement | null>(null);
html`<input ${patch(ref(input))} />`;
input.get(); // the element, or null
```

### `view`

```ts
const view: <T>(sig: Sig<T>, viewFn: (val: T) => AnyView) => View<T, ViewContext<T>>;
```

Conditionally renders one view or another. Whenever `sig` changes, `viewFn`
runs with the new value, the previous view is torn down, and a new one is
mounted in its place.

**Type parameters**

- `T` — the value type.

**Parameters**

- `sig` — the signal to switch on.
- `viewFn` — builds the view for a value.

**Returns** a `View` that swaps its contents.

**Example**

```ts
html`<div>${view(isEmpty, (v) => (v ? text('empty') : listView))}</div>`;
```

### `repeat`

```ts
const repeat: <T>(sig: Sig<T[]>, prop: RepeatProp<T>) => View<T[], RepeatContext<T>>;
```

Keyed list rendering. On each change `repeat` matches items by `key`, then
reuses, moves, creates, or removes as few DOM nodes as possible. The item
comparator defaults to `eq`; when an item is deeply equal to the track it
already occupies, the track is reused without rebuilding its view. An empty
array renders `<!--empty-list-->`.

**Type parameters**

- `T` — the item type.

**Parameters**

- `sig` — the signal holding the items.
- `prop` — the key/view/eq options.

**Returns** a `View` rendering the list.

**Example**

```ts
html`<ul>${repeat(todos, {
  key: (item) => item.id.toString(),
  view: (item) => html`<li>${text(item.label)}</li>`,
})}</ul>`;
```

### `list`

```ts
const list: <T>(items: readonly T[], viewFn: (item: T, index: number) => AnyView) => View;
```

Renders a fixed array in order. `viewFn` is called once per item with the item
and its 0-based index, and each returned `AnyView` is appended in sequence.
There is no keying or reconciliation and no reactive source; any reactivity
comes from the views `viewFn` returns. An empty array renders
`<!--empty-list-->`.

**Type parameters**

- `T` — the item type.

**Parameters**

- `items` — the items to render.
- `viewFn` — builds the view for an item and its index.

**Returns** a `View` rendering the items.

**Example**

```ts
html`<ul>${list(items, (item, i) => html`<li>${i}: ${text(item)}</li>`)}</ul>`;
```

### `frag`

```ts
const frag: (...views: AnyView[]) => View;
```

Composes several views into one content-position view. The views' nodes are
inserted as flat siblings, in order, with no wrapper element; nested
fragments flatten. Reactivity comes from the child views. `frag()` with no
arguments renders nothing.

**Parameters**

- `views` — the views to compose.

**Returns** a `View` rendering the views as siblings.

**Example**

```ts
html`<div>${frag(text('a'), html`<b>${text('b')}</b>`)}</div>`;
```

### `render`

```ts
const render: (viewArg: AnyView | (() => AnyView), node: Node) => (() => void);
```

Mounts a view into `node` by appending its `node`. Accepts a `View` directly
or a factory function that returns one. Returns a disposer that detaches every
bind in the tree and removes the nodes from `node`; calling it twice is a
no-op.

**Parameters**

- `viewArg` — the view, or a function returning one.
- `node` — the node to mount into.

**Returns** a disposer that unmounts the view.

**Example**

```ts
const dispose = render(App(), document.querySelector('#app')!);
dispose();
```

### `createBind`

```ts
const createBind: <T, C extends CmdContext>(sig: Sig<T>, context: C, cmd: Cmd<T, C>) => Bind<T, C>;
```

Wires `cmd(sig.get(), context)` to run whenever `sig` changes.

**Type parameters**

- `T` — the signal's value type.
- `C` — the command context type.

**Parameters**

- `sig` — the signal to observe.
- `context` — the context passed to `cmd`.
- `cmd` — the command run on change.

**Returns** the registered binding.

### `removeBind`

```ts
const removeBind: <T, C extends CmdContext>(bind: Bind<T, C>) => void;
```

Detaches a binding and marks it removed so queued runs are skipped.

**Type parameters**

- `T` — the signal's value type.
- `C` — the command context type.

**Parameters**

- `bind` — the binding to remove.

### `eq`

```ts
const eq: <T>(a: T, b: T) => boolean;
```

Deep structural equality for primitives, arrays, and plain objects, deferring
to `a.equals(b)` when `a` implements `Equatable`. Any other object — `Date`,
`RegExp`, `Map`, `Set`, class instances, null-prototype objects — is equal
only by reference. This is the default comparator for `Sig.update` and
`repeat`.

**Type parameters**

- `T` — the value type.

**Parameters**

- `a` — the first value.
- `b` — the second value.

**Returns** `true` when `a` and `b` are deeply equal.

### `toBoundary`

```ts
const toBoundary: (node: Node) => Boundary;
```

Wraps a node in a `Boundary`. A `DocumentFragment` spans its first and
last child; any other node covers itself. Throws `E2` on an empty fragment.

**Parameters**

- `node` — the node to wrap.

**Returns** the node's boundary.

### `walkBoundary`

```ts
const walkBoundary: (b: Boundary, fn: (node: Node) => void) => void;
```

Visits every node from `b.start` through `b.end`.

**Parameters**

- `b` — the boundary to walk.
- `fn` — called with each node.

### `toPatchItem`

```ts
const toPatchItem: <T>(source: T | Sig<T>, extra: unknown[] | undefined, cmd: Cmd<T, PatchContext>) => ToPatchItem<T>;
```

Builds a deferred patch item: a factory that resolves against the target
element on mount and pairs a source value with a command. This is the shared
primitive behind `id`, `val`, `attr`, `style`, `styleProp`, `toggleClass`,
`toggleClasses`, `act`, and `on`.

**Type parameters**

- `T` — the source value type.

**Parameters**

- `source` — the plain value or `Sig` the command binds.
- `extra` — extra command arguments, such as the attribute or style key.
- `cmd` — the command run with the value and context.

**Returns** a factory that builds the `PatchItem` for an element.

### `Sig`

```ts
class Sig<T> implements Equatable { ... }
```

The core reactive value. A `Sig` holds a value and a set of bindings that run
when it changes; writes are queued and coalesced in a microtask.

**Type parameters**

- `T` — the value type.

**Members**

- `equals` — `Equatable` implementation; two `Sig`s are equal when their values are deeply equal.
- `get` — Reads the current value.
- `notify` — Enqueues dependents without changing the value; use after in-place mutation.
- `forceUpdate` — Sets the value and always notifies dependents, even when deeply equal.
- `update` — Sets the value and notifies dependents only when `eq(v, current)` is false.
- `trans` — Applies `fn` to the current value via `update`, so an equal result is skipped.
- `addBind` — Registers a binding. Prefer `createBind` or the `patch`/`text`/`view` APIs.
- `removeBind` — Unregisters a binding; runs `cleanup()` when the last one goes away.
- `getBinds` — Returns the current bindings.
- `cleanup` — Overridable hook called when a signal loses all bindings. No-op on `Sig`.

### `DerivedSig`

```ts
class DerivedSig<T> extends Sig<T> { ... }
```

A `Sig` produced by `compute`. Extends `Sig` and additionally tracks the
source bindings that feed it: it detaches from its sources when it loses its
last consumer, and re-links and recomputes once when a consumer is added
again.

**Type parameters**

- `T` — the derived value type.

**Members**

- `addFromBind` — Registers a source binding.
- `addBind` — Registers a consumer; re-links to sources and recomputes once if detached.
- `cleanup` — Removes every source binding when the derived signal has no consumers.

### `View`

```ts
interface View<T = unknown, C extends CmdContext = any> { ... }
```

The unit returned by `html`, `text`, `raw`, `view`, `repeat`, `list`, and
`frag`.

**Type parameters**

- `T` — the bound value type.
- `C` — the bind context type.

**Members**

- `type` — Discriminant identifying a view.
- `node` — The DOM node or `DocumentFragment` the view occupies.
- `bind` — The view's own binding, when it is reactive.
- `attached` — Whether the view's bindings are currently attached to their signals.
- `detach` — Tears down the view's bindings and, recursively, those of its children, and runs any teardown cleanups. The bind objects are released so `reattach` can restore them.
- `reattach` — Re-adds bindings removed by `detach` and catches them up.
- `boundary` — Returns the nodes the view currently occupies.
- `children` — The interpolated children of a template view.

### `Patch`

```ts
interface Patch { ... }
```

A collection of deferred bindings to apply to one element, produced by
`patch`.

**Members**

- `type` — Discriminant identifying a patch.
- `toPatchItems` — Deferred patch-item factories, resolved against the target element on mount.
- `attached` — Whether the patch's bindings are currently attached to their signals.
- `detach` — Tears down the bindings created when the patch was committed, keeping them so `reattach` can restore them.
- `reattach` — Re-adds bindings removed by `detach` and catches them up.

### `Reactive`

```ts
type Reactive<T> = T | Sig<T> | undefined;
```

A value that may be plain, a `Sig`, or `undefined`.

**Type parameters**

- `T` — the underlying value type.

### `Eq`

```ts
type Eq<T> = (a: T, b: T) => boolean;
```

A value equality function.

**Type parameters**

- `T` — the value type.

### `Equatable`

```ts
interface Equatable { ... }
```

Implement this on a value type to give `eq` custom equality semantics.

**Members**

- `equals` — Returns whether `this` and `other` are equal.

### `Bind`

```ts
interface Bind<T, C extends CmdContext> { ... }
```

A registered binding: the signal, its command context, and the command that
runs when the signal changes.

**Type parameters**

- `T` — the signal's value type.
- `C` — the command context type.

**Members**

- `sig` — The signal this binding observes.
- `context` — The context passed to `cmd` on each run.
- `cmd` — The command run with the current value and context.
- `removed` — Set when the binding is detached; a removed binding is skipped.
- `queued` — Queue flag; true while the binding is queued for the next flush.
- `group` — Group flag. Binds that share a group (the source binds of one `compute` record) are enqueued at most once per flush.

### `AnyBind`

```ts
type AnyBind = Bind<any, any>;
```

A `Bind` with erased value and context types.

### `UnknownRecord`

```ts
type UnknownRecord = Record<string, unknown>;
```

Convenience alias for an arbitrary string-keyed object.

### `SigRecord`

```ts
interface SigRecord { ... }
```

A record whose values are signals, used by the record overload of
`compute`.

**Members**

- `[key: string]` — Each key maps to a signal of any value type.

### `ValRecord`

```ts
type ValRecord<K extends SigRecord> = { [P in keyof K]: K[P] extends Sig<infer U> ? U : never; };
```

Maps a `SigRecord` to a record of the signals' values.

**Type parameters**

- `K` — the signal record type.

### `ViewContext`

```ts
interface ViewContext<T> extends CmdContext { ... }
```

Context for the `view` command: the current inner view and the view factory.

**Type parameters**

- `T` — the value type.

**Members**

- `inner` — The currently mounted inner view.
- `viewFn` — Builds the next inner view from a new value.

### `ChildView`

```ts
type ChildView = AnyView | Patch;
```

An item that can occupy a slot in a view's children: a view or a patch.

### `AnyView`

```ts
type AnyView = View<any, any>;
```

A `View` with erased value and context types.

### `replaceWithView`

```ts
const replaceWithView: (old: Boundary, view: View) => Boundary;
```

Replaces an existing boundary with a view's node and returns the new boundary.

**Parameters**

- `old` — the boundary to replace.
- `view` — the view to mount.

**Returns** the boundary of the mounted view.

### `PatchProps`

```ts
interface PatchProps { ... }
```

Object form for `patch`, desugared into commands in key order:
`id`, `val`, `class` (per entry, via `toggleClass`), `style` (per entry,
via `style`), `styleProp` (per entry), `on` (per entry), and any other key
via `attr`. A key whose value is `undefined` is skipped.

**Members**

- `id` — Sets the element's `id`.
- `val` — Sets the element's `value` property.
- `class` — Toggles each class from the truthiness of its value.
- `style` — Sets inline style properties by typed name.
- `styleProp` — Sets style properties via `setProperty` (custom properties, untyped names).
- `on` — Registers DOM event listeners.
- `[attr: string]` — Any other key is set as an attribute via `attr`.

### `PatchContext`

```ts
interface PatchContext extends CmdContext { ... }
```

Context passed to patch commands: the target node plus any extra arguments.

**Members**

- `node` — The element the binding applies to.
- `extra` — Extra arguments for the command, such as the attribute or style key.

### `PatchItem`

```ts
interface PatchItem<T> { ... }
```

One resolved patch binding: a source value, its context, and the command.

**Type parameters**

- `T` — the source value type.

**Members**

- `source` — The plain value or `Sig` the command binds.
- `context` — The context passed to `cmd`.
- `cmd` — The command run with the value and context.

### `ToPatchItem`

```ts
type ToPatchItem<T> = (el: Element) => PatchItem<T>;
```

A factory that defers reading the target element until mount.

**Type parameters**

- `T` — the source value type.

### `AnyPatchItem`

```ts
type AnyPatchItem = PatchItem<any>;
```

A `PatchItem` with an erased value type.

### `ToAnyPatchItem`

```ts
type ToAnyPatchItem = (el: Element) => AnyPatchItem;
```

A `ToPatchItem` with an erased value type.

### `WritableStyleKey`

```ts
type WritableStyleKey = { [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K : never; }[keyof CSSStyleDeclaration];
```

The union of `CSSStyleDeclaration` keys whose values are strings.

### `ActFn`

```ts
type ActFn<T> = (elem: Element, val?: T) => void;
```

A custom patch callback run on mount and on change.

**Type parameters**

- `T` — the value type.

### `RepeatProp`

```ts
type RepeatProp<T> = { ... }
```

Options for `repeat`.

**Type parameters**

- `T` — the item type.

**Members**

- `key` — Returns the unique, stable key for an item.
- `view` — Builds the view for an item.
- `eq` — Item comparator. (defaults to `eq`)

### `RepeatContext`

```ts
interface RepeatContext<T> extends CmdContext { ... }
```

Context for the `repeat` command.

**Type parameters**

- `T` — the item type.

**Members**

- `prop` — The repeat options.
- `boundary` — The current node boundary.
- `tracks` — The tracked items and their views.

### `Boundary`

```ts
interface Boundary { ... }
```

An inclusive range of sibling nodes (`start` through `end`).

**Members**

- `start` — The first node in the range.
- `end` — The last node in the range.

### `removeBoundary`

```ts
const removeBoundary: (b: Boundary) => void;
```

Removes every node in the boundary. No-op if the boundary has no parent.

**Parameters**

- `b` — the boundary to remove.

### `replaceWithNode`

```ts
const replaceWithNode: (old: Boundary, node: Node) => Boundary;
```

Replaces an entire boundary with `node` and returns the new boundary. Throws
`E3` if the old boundary has no parent.

**Parameters**

- `old` — the boundary to replace.
- `node` — the replacement node.

**Returns** the boundary of the inserted node.

### `CmdContext`

```ts
interface CmdContext { ... }
```

Base type for command contexts: an arbitrary string-keyed record.

**Members**

- `[key: string]` — Any string key; values are unconstrained.

### `Cmd`

```ts
type Cmd<T, C extends CmdContext> = (val: T, context: C) => void;
```

The unit of work a binding runs: it receives the current value and context.

**Type parameters**

- `T` — the value type.
- `C` — the context type.

### `AnyCmd`

```ts
type AnyCmd = Cmd<any, any>;
```

A `Cmd` with erased value and context types.

### `at`

```ts
const at: <T>(arr: T[], index: number) => T;
```

Reads `arr[index]`, throwing `E1:<index>` when it is out of range.

**Type parameters**

- `T` — the element type.

**Parameters**

- `arr` — the array to read from.
- `index` — the index to read.

**Returns** the element at `index`.

### `err`

```ts
function err(code: string): never;
```

Throws an `Error` whose message is the short `code` (for example `E2` or
`E11:1:2`). The full text for each code lives in the README error table, so
string tables stay out of the bundle.

**Parameters**

- `code` — the coded error message.

