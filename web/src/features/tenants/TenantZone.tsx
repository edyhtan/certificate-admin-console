import { describeTimeZone } from '../../lib/dates'
import { useTenant } from './context'

/** "Perth · AWST UTC+8": the selected tenant and the zone every date on screen is shown in. */
export function TenantZone() {
  const { tenant } = useTenant()
  return (
    <span className="tenant-zone" title={tenant.timezone}>
      {tenant.name} · {describeTimeZone(tenant.timezone)}
    </span>
  )
}
