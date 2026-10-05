/**
 * Throws an `Error` whose message is the short `code` (for example `E2` or
 * `E11:1:2`). The full text for each code lives in the README error table, so
 * string tables stay out of the bundle.
 *
 * @param code - the coded error message.
 * @group Low-level API
 */
// Thrown errors carry a short code instead of a message. The full text for
// every code lives in the README so the runtime bundle stays small; use the
// table there to translate `E1`, `E7`, ... back into a sentence.
export function err(code: string): never {
  throw new Error(code);
}
