import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { setCurrentTenantCode } from '../api/tenant'

beforeEach(() => {
  // Units used outside the app shell (API helpers, single components) act as Sydney.
  // Pages rendered with renderRoute get the tenant from TenantProvider instead.
  setCurrentTenantCode('SYD')
  try {
    window.localStorage.clear()
  } catch {
    // ignore
  }
})

afterEach(() => {
  cleanup()
})
