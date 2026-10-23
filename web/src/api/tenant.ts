/**
 * The selected tenant code (e.g. `SYD`), read by the API client for the `tenant_id` header and
 * by every query key. `TenantProvider` sets it before any tenant-scoped page renders.
 * There is no default: reading it before a tenant is chosen is a bug and throws (fail closed).
 */
let selected: string | null = null

export class NoTenantSelectedError extends Error {
  constructor() {
    super('No tenant is selected')
    this.name = 'NoTenantSelectedError'
  }
}

export function currentTenantCode(): string {
  if (selected === null) throw new NoTenantSelectedError()
  return selected
}

export function setCurrentTenantCode(code: string | null): void {
  selected = code
}

/** Where the last chosen tenant is remembered between visits. */
export const TENANT_STORAGE_KEY = 'certificate-admin.tenant'

/** The remembered tenant code, or null if there is none or storage is unavailable. */
export function loadStoredTenantCode(): string | null {
  try {
    return window.localStorage.getItem(TENANT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeTenantCode(code: string): void {
  try {
    window.localStorage.setItem(TENANT_STORAGE_KEY, code)
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered
  }
}
