import type {Boundary} from './boundary';

// Internal: reports the boundary currently backing a view. `view` and `repeat`
// return a live getter because their contexts swap it on every update; `html`
// captures once because its fragment is consumed on append.
export const LIVE = Symbol('sigula.liveBoundary');

export type LiveBoundary = () => Boundary | undefined;

export const liveBoundary = (v: {
  [LIVE]?: LiveBoundary;
}): Boundary | undefined => v[LIVE]?.();
