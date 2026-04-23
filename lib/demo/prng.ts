/**
 * Mulberry32 — tiny deterministic PRNG. Same seed → same sequence, no matter
 * who calls it. Used to generate demo data so every viewer sees the same
 * numbers (makes QA/screenshots/bug reports trivial).
 */
export function makeRng(seed: number) {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Rng(seedString) — convenience. */
export function rngFor(seedString: string): Rng {
  return makeRng(hashSeed(seedString));
}

/** Integer in [min, max] inclusive. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Float in [min, max]. */
export function rngFloat(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/** Approximately-normal sample with given mean + std via sum-of-uniforms. */
export function rngNormal(rng: Rng, mean: number, std: number): number {
  const sum = rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng() + rng();
  return mean + std * (sum - 6);
}

/** Pick a random element. */
export function rngPick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
