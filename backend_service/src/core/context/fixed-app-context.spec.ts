import type { PrismaClient } from '@prisma/client';
import { AppContext } from './app-context.js';
import { FixedAppContext } from './fixed-app-context.js';

const db = { tag: 'db' } as unknown as PrismaClient;
const values = {
  db,
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
  actor: { id: 1, name: 'Administrator' },
};

describe('FixedAppContext', () => {
  it('is an AppContext that returns the values it was given', () => {
    const ctx = new FixedAppContext(values);
    expect(ctx).toBeInstanceOf(AppContext);
    expect(ctx.db).toBe(db);
    expect(ctx.timeZone).toBe('Australia/Sydney');
    expect(ctx.serialPrefix).toBe('SYD');
    expect(ctx.actor).toEqual({ id: 1, name: 'Administrator' });
  });

  it('uses the real clock by default', () => {
    const before = Date.now();
    const now = new FixedAppContext(values).now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('uses the clock it was given', () => {
    const at = new Date('2026-01-01T00:30:00+11:00');
    expect(new FixedAppContext({ ...values, now: () => at }).now()).toBe(at);
  });

  it('keeps its own copy, so later changes to the input do not leak in', () => {
    const input = { ...values };
    const ctx = new FixedAppContext(input);
    input.timeZone = 'Australia/Perth';
    expect(ctx.timeZone).toBe('Australia/Sydney');
  });
});
