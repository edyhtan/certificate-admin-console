import { AdminHealthProbe } from './admin-health-probe.js';
import type { SingleTenantAppContext } from './single-tenant-app-context.js';

function contextWith(ensureActor: ReturnType<typeof vi.fn>) {
  return { ensureActor } as unknown as SingleTenantAppContext;
}

describe('AdminHealthProbe', () => {
  it('is named "admin"', () => {
    expect(new AdminHealthProbe(contextWith(vi.fn())).name).toBe('admin');
  });

  it('is up when the admin row is loaded, loading it if needed', async () => {
    const ensureActor = vi
      .fn()
      .mockResolvedValue({ id: 1, name: 'Administrator' });
    await expect(
      new AdminHealthProbe(contextWith(ensureActor)).check(),
    ).resolves.toBeUndefined();
    expect(ensureActor).toHaveBeenCalledTimes(1);
  });

  it('is down while the admin row cannot be loaded', async () => {
    const probe = new AdminHealthProbe(
      contextWith(vi.fn().mockResolvedValue(undefined)),
    );
    await expect(probe.check()).rejects.toThrow('no "admin" row loaded');
  });
});
