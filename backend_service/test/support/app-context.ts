import {
  FixedAppContext,
  type FixedAppContextValues,
} from '../../src/core/context/fixed-app-context.js';
import { TEST_ADMIN, testDb } from './db.js';

/**
 * A fixed AppContext over this run's test database: Sydney (D48) and the test admin.
 * Pass it to `createTestApp({ context })` to bind it, e.g. with a fixed clock.
 */
export function testAppContext(
  overrides: Partial<FixedAppContextValues> = {},
): FixedAppContext {
  return new FixedAppContext({
    db: testDb(),
    timeZone: 'Australia/Sydney',
    serialPrefix: 'SYD',
    actor: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
    ...overrides,
  });
}
