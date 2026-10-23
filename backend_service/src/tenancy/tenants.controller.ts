import type { TenantListResponse } from '@cert/shared';
import { Controller, Get } from '@nestjs/common';
import { TENANT_CODES, TENANTS } from './tenants.js';

/** `GET /api/tenants`: no tenant header needed. Never includes database names (D27). */
@Controller('tenants')
export class TenantsController {
  @Get()
  list(): TenantListResponse {
    return {
      items: TENANT_CODES.map((code) => ({
        code,
        name: TENANTS[code].name,
        timezone: TENANTS[code].timezone,
      })),
    };
  }
}
