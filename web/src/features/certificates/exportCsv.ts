import { useMutation } from '@tanstack/react-query'
import { endpoints, type CertificateExportQuery } from '@cert/shared'
import { apiRequest } from '../../api/client'
import { currentTenantCode } from '../../api/tenant'
import { filenameFromContentDisposition, saveBlob } from '../../lib/download'

export type ExportFilters = Partial<CertificateExportQuery>

/**
 * Downloads the CSV for the given search, filters and sort (no paging: every match). The file
 * is fetched with the tenant header and saved from memory; the server streams it (spec §6).
 * Returns the file name used.
 */
export async function exportCertificatesCsv(filters: ExportFilters): Promise<string> {
  const response = await apiRequest(endpoints.exportCertificates.path, {
    query: filters,
    headers: { Accept: 'text/csv' },
  })
  const blob = await response.blob()
  const filename =
    filenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    `certificates-${currentTenantCode()}.csv`
  saveBlob(blob, filename)
  return filename
}

export function useExportCertificates() {
  return useMutation({ mutationFn: exportCertificatesCsv })
}
