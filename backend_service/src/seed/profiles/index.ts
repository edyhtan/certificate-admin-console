import type { TenantCode } from '../../tenancy/tenants.js';
import type { SeedProfile } from '../seed-profile.js';
import { ADELAIDE } from './adelaide.js';
import { PERTH } from './perth.js';
import { SYDNEY } from './sydney.js';

/** One seed profile per registry tenant (D35). */
export const SEED_PROFILES: Readonly<Record<TenantCode, SeedProfile>> = {
  SYD: SYDNEY,
  PER: PERTH,
  ADL: ADELAIDE,
};
