import {err} from './err';

/**
 * Reads `arr[index]`, throwing `E1:<index>` when it is out of range.
 *
 * @typeParam T - the element type.
 * @param arr - the array to read from.
 * @param index - the index to read.
 * @returns the element at `index`.
 * @group Low-level API
 */
export const at = <T>(arr: T[], index: number): T => {
  const v = arr[index];
  if (v === undefined) err(`E1:${index}`);
  return v;
};
