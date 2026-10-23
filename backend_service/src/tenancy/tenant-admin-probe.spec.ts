import { TenantAdminProbe } from './tenant-admin-probe.js';
import { TenantNotSetUpError, type TenantScopes } from './tenant-scopes.js';

describe('TenantAdminProbe', () => {
  it('is named after the tenant', () => {
    expect(new TenantAdminProbe({} as TenantScopes, 'PER').name).toBe('admin:PER');
  });

  it('is up when the tenant scope (with its admin actor) can be built', async () => {
    const scopeFor = vi.fn().mockResolvedValue({});
    await expect(
      new TenantAdminProbe({ scopeFor } as unknown as TenantScopes, 'SYD').check(),
    ).resolves.toBeUndefined();
    expect(scopeFor).toHaveBeenCalledWith('SYD');
  });

  it('is down while the admin row is missing', async () => {
    const scopeFor = vi.fn().mockRejectedValue(new TenantNotSetUpError('ADL'));
    await expect(
      new TenantAdminProbe({ scopeFor } as unknown as TenantScopes, 'ADL').check(),
    ).rejects.toThrow('tenant ADL has no "admin" row');
  });
});
