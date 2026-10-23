import type { CertificateStatus } from '@cert/shared'

const labels: Record<CertificateStatus, string> = {
  valid: 'Valid',
  revoked: 'Revoked',
}

export function StatusBadge({ status }: { status: CertificateStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>
}
