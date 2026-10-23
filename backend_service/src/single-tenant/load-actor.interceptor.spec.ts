import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoadActorInterceptor } from './load-actor.interceptor.js';
import type { SingleTenantAppContext } from './single-tenant-app-context.js';

function httpContext(method: string, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

function setup(actor: unknown = { id: 1, name: 'Administrator' }) {
  const calls: string[] = [];
  const ensureActor = vi.fn(async () => {
    calls.push('ensureActor');
    return actor;
  });
  const next: CallHandler = {
    handle: vi.fn(() => {
      calls.push('handler');
      return of('result');
    }),
  };
  const interceptor = new LoadActorInterceptor({
    ensureActor,
  } as unknown as SingleTenantAppContext);
  return { interceptor, ensureActor, next, calls };
}

describe('LoadActorInterceptor', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'loads the actor before a %s handler runs',
    async (method) => {
      const { interceptor, next, calls } = setup();
      await expect(
        lastValueFrom(interceptor.intercept(httpContext(method), next)),
      ).resolves.toBe('result');
      expect(calls).toEqual(['ensureActor', 'handler']);
    },
  );

  it('still runs the handler when the actor cannot be loaded, so it fails closed itself', async () => {
    const { interceptor, next, calls } = setup(undefined);
    await expect(
      lastValueFrom(interceptor.intercept(httpContext('POST'), next)),
    ).resolves.toBe('result');
    expect(calls).toEqual(['ensureActor', 'handler']);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'skips the load for %s',
    async (method) => {
      const { interceptor, ensureActor, next } = setup();
      await lastValueFrom(interceptor.intercept(httpContext(method), next));
      expect(ensureActor).not.toHaveBeenCalled();
    },
  );

  it('skips the load outside HTTP', async () => {
    const { interceptor, ensureActor, next } = setup();
    await lastValueFrom(
      interceptor.intercept(httpContext('POST', 'rpc'), next),
    );
    expect(ensureActor).not.toHaveBeenCalled();
  });
});
