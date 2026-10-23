import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { AppContext } from './app-context.js';
import { FixedAppContext } from './fixed-app-context.js';

/** Shaped like a core service: injects AppContext, methods take business inputs only. */
@Injectable()
class SampleCoreService {
  constructor(private readonly ctx: AppContext) {}

  describe(label: string) {
    return {
      label,
      timeZone: this.ctx.timeZone,
      serialPrefix: this.ctx.serialPrefix,
      actor: this.ctx.actor.name,
      at: this.ctx.now().toISOString(),
      hasDb: this.ctx.db !== undefined,
    };
  }
}

/** A binding whose values can change between calls, like the tenancy binding from M3. */
class SwitchableContext extends AppContext {
  current: FixedAppContext;

  constructor(initial: FixedAppContext) {
    super();
    this.current = initial;
  }
  get db() {
    return this.current.db;
  }
  get timeZone() {
    return this.current.timeZone;
  }
  get serialPrefix() {
    return this.current.serialPrefix;
  }
  get actor() {
    return this.current.actor;
  }
  now() {
    return this.current.now();
  }
}

const db = {} as PrismaClient;
const sydney = new FixedAppContext({
  db,
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
  actor: { id: 1, name: 'Administrator' },
  now: () => new Date('2026-04-05T02:30:00Z'),
});
const perth = new FixedAppContext({
  db,
  timeZone: 'Australia/Perth',
  serialPrefix: 'PER',
  actor: { id: 7, name: 'Perth Admin' },
  now: () => new Date('2026-12-31T15:30:00Z'),
});

describe('AppContext in a core service', () => {
  it('gives a core service its context with no context parameter', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SampleCoreService, { provide: AppContext, useValue: sydney }],
    }).compile();

    expect(moduleRef.get(SampleCoreService).describe('x')).toEqual({
      label: 'x',
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: 'Administrator',
      at: '2026-04-05T02:30:00.000Z',
      hasDb: true,
    });
  });

  it('reads the context on every call, so one singleton serves changing contexts', async () => {
    const context = new SwitchableContext(sydney);
    const moduleRef = await Test.createTestingModule({
      providers: [SampleCoreService, { provide: AppContext, useValue: context }],
    }).compile();
    const service = moduleRef.get(SampleCoreService);

    expect(service.describe('a').serialPrefix).toBe('SYD');
    context.current = perth;
    expect(service.describe('b')).toMatchObject({
      serialPrefix: 'PER',
      timeZone: 'Australia/Perth',
      actor: 'Perth Admin',
    });
  });

  it('cannot be built without a binding', async () => {
    await expect(
      Test.createTestingModule({ providers: [SampleCoreService] }).compile(),
    ).rejects.toThrow(/AppContext/);
  });
});
