// Thrown errors carry a short code instead of a message. The full text for
// every code lives in the README so the runtime bundle stays small; use the
// table there to translate `E1`, `E7`, ... back into a sentence.
export function err(code: string): never {
  throw new Error(code);
}
