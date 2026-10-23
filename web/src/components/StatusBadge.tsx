/** Certificate status (spec §3.2). Replace with the shared contract's type when M0.T2 lands. */
export type CertificateStatus = 'valid' | 'revoked'

const labels: Record<CertificateStatus, string> = {
  valid: 'Valid',
  revoked: 'Revoked',
}

export function StatusBadge({ status }: { status: CertificateStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>
}
