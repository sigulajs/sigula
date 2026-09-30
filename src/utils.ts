export type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null;

export const isEqual = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (a === null || b === null || typeof a !== 'object') return false;

  // may let Array always return false
  // if (Array.isArray(a) || Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
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
      if (!b.has(key) || !isEqual(val, b.get(key))) return false;
    }
    return true;
  }

  // Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const arrA = Array.from(a);
    const arrB = Array.from(b);
    return isEqual(arrA, arrB);
  }

  // Object & Record
  if (Object.is(a, b)) return true;
  if (!isRecord(a) || !isRecord(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
};
