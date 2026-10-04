export const at = <T>(arr: T[], index: number): T => {
  const v = arr[index];
  if (v === undefined) throw new RangeError(`E1:${index}`);
  return v;
};
