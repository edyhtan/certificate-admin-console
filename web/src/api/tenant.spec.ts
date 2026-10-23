import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentTenantCode,
  loadStoredTenantCode,
  NoTenantSelectedError,
  setCurrentTenantCode,
  storeTenantCode,
  TENANT_STORAGE_KEY,
} from './tenant'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selected tenant', () => {
  it('returns the selected code', () => {
    setCurrentTenantCode('PER')
    expect(currentTenantCode()).toBe('PER')
  })

  it('throws when no tenant is selected (fail closed)', () => {
    setCurrentTenantCode(null)
    expect(() => currentTenantCode()).toThrow(NoTenantSelectedError)
  })
})

describe('remembered tenant', () => {
  it('stores and loads the code', () => {
    expect(loadStoredTenantCode()).toBeNull()
    storeTenantCode('ADL')
    expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe('ADL')
    expect(loadStoredTenantCode()).toBe('ADL')
  })

  it('ignores storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(loadStoredTenantCode()).toBeNull()
    expect(() => storeTenantCode('PER')).not.toThrow()
  })
})
