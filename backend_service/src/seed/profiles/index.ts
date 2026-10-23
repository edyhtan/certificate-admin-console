import type { SeedProfile } from '../seed-profile.js';
import { SYDNEY } from './sydney.js';

/** Seed profiles by serial prefix. M3 adds `PER` and `ADL`. */
export const SEED_PROFILES: Readonly<Record<string, SeedProfile>> = {
  SYD: SYDNEY,
};
