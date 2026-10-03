import type {CmdContext} from './cmd';
import {createBind, DerivedSig, Sig} from './sig.bind';

export interface SigRecord {
  // biome-ignore lint/suspicious/noExplicitAny: any sig val
  [key: string]: Sig<any>;
}

export type ValRecord<K extends SigRecord> = {
  [P in keyof K]: K[P] extends Sig<infer U> ? U : never;
};

const toValRecord = <S extends SigRecord>(source: S): ValRecord<S> => {
  const keys = Object.keys(source);
  const vals: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k && source[k]) {
      vals[k] = source[k].get();
    }
  }
  return vals as ValRecord<S>;
};

interface ComputeContext<S, T> extends CmdContext {
  target: Sig<T>;
  fn: (s: S) => T;
}

interface ComputeRecordContext<S extends SigRecord, T> extends CmdContext {
  source: S;
  target: Sig<T>;
  fn: (v: ValRecord<S>) => T;
}

const computeCmd = <S, T>(s: S, ctx: ComputeContext<S, T>) => {
  const res = ctx.fn(s);
  ctx.target.update(res);
};

const computeRecordCmd = <S extends SigRecord, T>(
  _s: unknown,
  ctx: ComputeRecordContext<S, T>,
) => {
  const vals = toValRecord(ctx.source);
  const res = ctx.fn(vals);
  ctx.target.update(res);
};

const _compute = <S, T>(source: Sig<S>, fn: (v: S) => T): DerivedSig<T> => {
  const output = fn(source.get());
  const target = new DerivedSig(output);
  const ctx: ComputeContext<S, T> = {target, fn};
  const bind = createBind(source, ctx, computeCmd);
  target.addFromBind(bind);
  return target;
};

const _computeRecord = <S extends SigRecord, T>(
  source: S,
  fn: (v: ValRecord<S>) => T,
): DerivedSig<T> => {
  const vals = toValRecord(source);
  const res = fn(vals);
  const target = new DerivedSig(res);

  const ctx: ComputeRecordContext<S, T> = {source, target, fn};

  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k && source[k]) {
      const bind = createBind(source[k], ctx, computeRecordCmd);
      target.addFromBind(bind);
    }
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
