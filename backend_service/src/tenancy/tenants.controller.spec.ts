import { tenantListResponseSchema } from '@cert/shared';
import { TenantsController } from './tenants.controller.js';

describe('TenantsController', () => {
  it('lists code, name and timezone for every tenant, matching the contract', () => {
    const body = new TenantsController().list();
    expect(body).toEqual({
      items: [
        { code: 'SYD', name: 'Sydney', timezone: 'Australia/Sydney' },
        { code: 'PER', name: 'Perth', timezone: 'Australia/Perth' },
        { code: 'ADL', name: 'Adelaide', timezone: 'Australia/Adelaide' },
      ],
    });
    expect(tenantListResponseSchema.parse(body)).toEqual(body);
  });

  it('never includes database names (D27)', () => {
    expect(JSON.stringify(new TenantsController().list())).not.toMatch(/cert_|database/);
  });
});
