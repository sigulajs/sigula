import type {CmdContext} from './cmd';
import {createBind, DerivedSig, removeBind, Sig} from './sig.bind';

/**
 * A record whose values are signals, used by the record overload of
 * {@link compute}.
 *
 * @group Reactivity
 */
export interface SigRecord {
  /** Each key maps to a signal of any value type. */
  // biome-ignore lint/suspicious/noExplicitAny: any sig val
  [key: string]: Sig<any>;
}

/**
 * Maps a {@link SigRecord} to a record of the signals' values.
 *
 * @typeParam K - the signal record type.
 * @group Reactivity
 */
export type ValRecord<K extends SigRecord> = {
  [P in keyof K]: K[P] extends Sig<infer U> ? U : never;
};

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous source sigs
type ComputeEntry = [string, Sig<any>];

interface ComputeContext<S, T> extends CmdContext {
  target: Sig<T>;
  fn: (s: S) => T;
}

interface ComputeRecordContext<S extends SigRecord, T> extends CmdContext {
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
  entries: ComputeEntry[];
}

const computeCmd = <S, T>(s: S, ctx: ComputeContext<S, T>) => {
  ctx.target.update(ctx.fn(s));
};

const computeRecordCmd = <S extends SigRecord, T>(
  _s: unknown,
  ctx: ComputeRecordContext<S, T>,
) => {
  const vals: Record<string, unknown> = {};
  for (const [k, s] of ctx.entries) vals[k] = s.get();
  ctx.target.update(ctx.fn(vals as ValRecord<S>));
};

const _compute = <S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T> => {
  const target = new DerivedSig(fn(source.get()));
  const ctx: ComputeContext<S, T> = {target, fn};
  target.addFromBind(createBind(source, ctx, computeCmd));
  return target;
};

const _computeRecord = <S extends SigRecord, T>(
  source: S,
  fn: (v: ValRecord<S>) => T,
): DerivedSig<T> => {
  const entries: ComputeEntry[] = [];
  const vals: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(source)) {
    if (!k || !s) continue;
    entries.push([k, s]);
    vals[k] = s.get();
  }

  const target = new DerivedSig(fn(vals as ValRecord<S>));
  const ctx: ComputeRecordContext<S, T> = {target, fn, entries};

  for (const entry of entries) {
    target.addFromBind(createBind(entry[1], ctx, computeRecordCmd));
  }

  return target;
};

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
export function compute<S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T>;
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
export function compute<S extends SigRecord, T>(
  source: S,
  fn: (v: ValRecord<S>) => T,
): DerivedSig<T>;
// biome-ignore lint/suspicious/noExplicitAny: any source
export function compute(source: any, fn: (v: any) => any): DerivedSig<any> {
  return source instanceof Sig
    ? _compute(source, fn)
    : _computeRecord(source, fn);
}

const _recordValue = <S extends SigRecord>(source: S): ValRecord<S> => {
  const vals: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(source)) {
    if (!k || !s) continue;
    vals[k] = s.get();
  }
  return vals as ValRecord<S>;
};

const _bind = <S>(source: Sig<S>, fn: (v: S) => void): (() => void) => {
  const bind = createBind(source, {}, (v: S) => fn(v));
  return () => removeBind(bind);
};

/**
 * Runs a side effect over one signal: `fn` is called immediately with the
 * current value and again whenever the signal changes.
 *
 * @typeParam S - the source value type.
 * @param source - the signal to observe.
 * @param fn - the effect, run with the current value.
 * @returns a disposer that detaches the effect.
 * @example
 * ```ts
 * const dispose = effect(count, (v) => console.log(v));
 * dispose();
 * ```
 * @group Reactivity
 */
export function effect<S>(source: Sig<S>, fn: (v: S) => void): () => void;
/**
 * Runs a side effect over a record of signals: `fn` is called immediately with
 * the record of current values and again, once per flush, after any source
 * changes.
 *
 * @typeParam S - the signal record type.
 * @param source - a record of signals.
 * @param fn - the effect, run with the record of current values.
 * @returns a disposer that detaches the effect.
 * @example
 * ```ts
 * const dispose = effect({x, y}, (v) => console.log(v.x + v.y));
 * ```
 * @group Reactivity
 */
export function effect<S extends SigRecord>(
  source: S,
  fn: (v: ValRecord<S>) => void,
): () => void;
// biome-ignore lint/suspicious/noExplicitAny: any source
export function effect(source: any, fn: (v: any) => void): () => void {
  if (source instanceof Sig) {
    fn(source.get());
    return _bind(source, fn);
  }
  // Run with the current record before wiring any bind, so a write performed by
  // `fn` cannot re-trigger the effect and a throw cannot leak the derived binds.
  fn(_recordValue(source));
  return _bind(
    compute(source, (v) => v),
    fn,
  );
}
