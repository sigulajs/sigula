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
export const eq = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (a === null || b === null || typeof a !== 'object') return false;

  if (isEquatable(a)) return a.equals(b);

  // may let Array always return false
  // if (Array.isArray(a) || Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!eq(a[i], b[i])) return false;
    }
    return true;
  }

  // Date
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();

  // RegExp
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      if (!b.has(key) || !eq(val, b.get(key))) return false;
    }
    return true;
  }

  // Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const arrA = Array.from(a);
    const arrB = Array.from(b);
    return eq(arrA, arrB);
  }

  // Object & Record
  // Reject different prototypes before falling back to a key comparison.
  // Object.keys is [] for Date, Map, Set, RegExp, Error and [], so without
  // this guard isEqual([], {}) and isEqual(new Date(0), {}) both report
  // equal and Sig.update silently swallows a shape-changing write.
  // Must stay BELOW the isEquatable check above: hoisting it stops a user
  // Equatable from ever being consulted.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  // both are objects sharing one prototype from here on, and the length check
  // plus Object.hasOwn below prove the two key sets are identical, so ao[key]
  // is always an own property
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
