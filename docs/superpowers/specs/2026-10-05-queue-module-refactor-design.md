# Queue as module state and functions

Date: 2026-10-05

## Motivation

The update queue is a module singleton implemented as a class instance:

```ts
class Queue { private _binds = []; private head = 0; ... }
const QUEUE = new Queue();
```

The bundler's minifier renames local bindings but not class method or field
names, so `addAll`, `kick`, `flush`, `_binds`, `head`, `running`, and `scheduled`
all survive minification verbatim (verified in `dist/sigula.js`), and every access
carries a `this.` prefix. Since the queue is a singleton and its API was never
exported, module-scope state and `const` functions express the same thing, let the
minifier rename everything to short names, and drop the class boilerplate.

## Design

### Shape

Delete `class Queue` and `const QUEUE = new Queue()` from
`src/core/sig.bind.ts` and replace them with module-scope state and three `const`
arrow functions:

```ts
// Module singleton, kept as plain state and functions rather than a class
// instance so the minifier can rename the state and helpers.
let queue: AnyBind[] = [];
let head = 0;
let running = false;
let scheduled = false;

const enqueue = (binds: readonly AnyBind[]): void => {
  for (const bind of binds) {
    if (bind.queued) continue;
    bind.queued = true;
    queue.push(bind);
  }
  if (queue.length > head) kick();
};

const kick = (): void => {
  if (running || scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    running = true;
    scheduled = false;
    flush();
  });
};

const flush = (): void => {
  running = true;
  try {
    while (head < queue.length) {
      const bind = queue[head++] as AnyBind;
      try {
        const {removed, sig, context, cmd} = bind;
        if (!removed) cmd(sig.get(), context);
      } catch (err) {
        console.error('[Queue] task failed:', err, bind);
      } finally {
        // re-arm after running: cmd reads sig.get() at call time, so a bind
        // that runs after a write already sees the newest value and must
        // not re-run, while one that ran before it has to be queued again
        bind.queued = false;
      }
    }
  } finally {
    running = false;
    if (head < queue.length) {
      // almost impossible in js/ts
      queue = queue.slice(head);
      head = 0;
      kick();
    } else {
      queue.length = 0;
      head = 0;
    }
  }
};
```

`kick` and `flush` reference each other; because those references are inside the
function bodies and every call happens after module initialisation, `const`
arrows are safe (no temporal-dead-zone hazard).

### Call site

`Sig.notify` changes from `QUEUE.addAll(this._binds)` to
`enqueue(this._binds)`. `forceUpdate` is unchanged (it calls `notify`).

### Behaviour

The logic is copied verbatim: the same `queued` de-duplication, the same
`running`/`scheduled` guards, the same `head`/slice re-arm, the same error
isolation and `'[Queue] task failed:'` message, and the same comments. Only the
container changes.

## Scope

Only `src/core/sig.bind.ts`. `Queue` was module-private, so there is no public
API, type declaration, `Reference.md`, or README change. `Sig`/`DerivedSig` stay
classes (they are instantiated and inherited; converting them is out of scope).

## Testing

No new tests. The existing "queue coalescing" suite in
`src/test/sig.bind.test.ts` already covers per-bind coalescing, re-arming, binds
added mid-flush, removed binds, error isolation, and a signal with more binds than
the argument-count limit; it must stay green.

## Verification

- `pnpm test` and `pnpm typecheck` pass.
- `pnpm build` succeeds.
- Measure `dist/sigula.js` gzip size before and after; report the delta. The
  expected result is a small reduction (tens of bytes), never an increase.

## Acceptance criteria

1. `Queue` and `QUEUE` are gone; the queue is module-scope `let` state with
   `const` `enqueue`/`kick`/`flush` functions.
2. `Sig.notify` calls `enqueue(this._binds)`; runtime behaviour is unchanged.
3. The full test suite and typecheck pass.
4. The build succeeds and the gzipped bundle does not grow.
