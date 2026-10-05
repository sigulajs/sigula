import type {CmdContext} from './cmd';
import {createBind, DerivedSig, Sig} from './sig.bind';

export interface SigRecord {
  // biome-ignore lint/suspicious/noExplicitAny: any sig val
  [key: string]: Sig<any>;
}

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

export function compute<S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T>;
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
