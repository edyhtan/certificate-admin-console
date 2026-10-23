import { errorMessage } from '../../api/errors'
import { useExportCertificates, type ExportFilters } from './exportCsv'

/** "Export CSV" for the list's current search, filters and sort. */
export function ExportButton({ filters }: { filters: ExportFilters }) {
  const exportCsv = useExportCertificates()

  return (
    <div className="export">
      <button
        type="button"
        onClick={() => exportCsv.mutate(filters)}
        disabled={exportCsv.isPending}
        aria-describedby={exportCsv.isError ? 'export-error' : undefined}
      >
        {exportCsv.isPending ? (
          <>
            <span className="spinner" aria-hidden="true" /> Exporting…
          </>
        ) : (
          'Export CSV'
        )}
      </button>
      {exportCsv.isError && (
        <span id="export-error" className="form-error" role="alert">
          Couldn’t export: {errorMessage(exportCsv.error)}
        </span>
      )}
    </div>
  )
}
