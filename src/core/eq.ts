/**
 * Implement this on a value type to give `eq` custom equality semantics.
 *
 * @group Reactivity
 */
export interface Equatable {
  /** Returns whether `this` and `other` are equal. */
  equals(other: unknown): boolean;
}

/**
 * A value equality function.
 *
 * @typeParam T - the value type.
 * @group Reactivity
 */
export type Eq<T> = (a: T, b: T) => boolean;

const isEquatable = (value: unknown): value is Equatable =>
  typeof value === 'object' &&
  value !== null &&
  'equals' in value &&
  typeof value.equals === 'function';

/**
 * Convenience alias for an arbitrary string-keyed object.
 *
 * @group Reactivity
 */
export type UnknownRecord = Record<string, unknown>;

/**
 * Deep structural equality for primitives, arrays, and plain objects, deferring
 * to `a.equals(b)` when `a` implements `Equatable`. Any other object — `Date`,
 * `RegExp`, `Map`, `Set`, class instances, null-prototype objects — is equal
 * only by reference. This is the default comparator for `Sig.update` and
 * `repeat`.
 *
 * @typeParam T - the value type.
 * @param a - the first value.
 * @param b - the second value.
 * @returns `true` when `a` and `b` are deeply equal.
 * @group Reactivity
 */
export const eq = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (a === null || b === null || typeof a !== 'object') return false;

  if (isEquatable(a)) return a.equals(b);

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!eq(a[i], b[i])) return false;
    }
    return true;
  }

  // Only plain objects are compared structurally. Everything else (Date, RegExp,
  // Map, Set, class instances, null-prototype objects) is equal only by
  // reference, which the `a === b` check above already handled.
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.getPrototypeOf(b) || proto !== Object.prototype) {
    return false;
  }

  const ao = a as UnknownRecord;
  const bo = b as UnknownRecord;

  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;

  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i] as string;
    if (!Object.hasOwn(bo, key)) return false;
    if (!eq(ao[key], bo[key])) return false;
  }

  return true;
};
