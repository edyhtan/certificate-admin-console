import type { CertificateDetail, CertificateListResponse, CertificateSummary } from '@cert/shared'

export const SYDNEY = 'Australia/Sydney'

/** A list row. The default is issued at 00:30 on 1 Jan 2026 in Sydney (13:30 UTC on 31 Dec 2025). */
export function certificateSummary(overrides: Partial<CertificateSummary> = {}): CertificateSummary {
  return {
    id: 1,
    serial: 'SYD-2026-000001',
    participantId: 11,
    participantName: "Ana O'Neil",
    courseId: 21,
    courseTitle: 'Workplace Safety',
    status: 'valid',
    issuedAt: '2025-12-31T13:30:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

export function certificateDetail(overrides: Partial<CertificateDetail> = {}): CertificateDetail {
  return {
    ...certificateSummary(),
    enrollmentId: 31,
    issuedBy: { id: 1, name: 'admin' },
    revokedBy: null,
    revokeReason: null,
    timezone: SYDNEY,
    ...overrides,
  }
}

export function certificatePage(
  items: CertificateSummary[],
  overrides: Partial<CertificateListResponse> = {},
): CertificateListResponse {
  return { items, page: 1, pageSize: 20, total: items.length, timezone: SYDNEY, ...overrides }
}
