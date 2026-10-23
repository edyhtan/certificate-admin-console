import { Link, useSearchParams } from 'react-router'
import type { CertificateSummary } from '@cert/shared'
import { DataTable, type Column } from '../components/DataTable'
import { Pagination } from '../components/Pagination'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { parsePageParam, useCertificateList } from '../features/certificates/api'
import { formatDateInTimeZone } from '../lib/dates'

function columnsFor(timeZone: string): Column<CertificateSummary>[] {
  return [
    {
      key: 'serial',
      header: 'Serial',
      cell: (row) => <Link to={`/certificates/${row.id}`}>{row.serial}</Link>,
    },
    { key: 'participant', header: 'Participant', cell: (row) => row.participantName },
    { key: 'course', header: 'Course', cell: (row) => row.courseTitle },
    { key: 'issued', header: 'Issue date', cell: (row) => formatDateInTimeZone(row.issuedAt, timeZone) },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ]
}

export function CertificateListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePageParam(searchParams.get('page'))
  const query = useCertificateList({ page })

  function goToPage(next: number) {
    setSearchParams((params) => {
      if (next <= 1) params.delete('page')
      else params.set('page', String(next))
      return params
    })
  }

  let content
  if (query.isPending) {
    content = <LoadingState label="Loading certificates…" />
  } else if (query.isError) {
    content = (
      <ErrorState
        title="Couldn’t load certificates"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (query.data.total === 0) {
    content = (
      <EmptyState
        title="No certificates yet"
        description="Certificates appear here once they are issued."
        action={<Link to="/bulk-issue">Bulk issue certificates</Link>}
      />
    )
  } else {
    // The page on screen: while the next page loads, this is still the previous one.
    const { items, total, pageSize, timezone, page: shownPage } = query.data
    content = (
      <>
        {items.length === 0 ? (
          <EmptyState
            title={`No certificates on page ${shownPage}`}
            description="This page is past the end of the list."
            action={
              <button type="button" onClick={() => goToPage(1)}>
                Go to the first page
              </button>
            }
          />
        ) : (
          <DataTable
            caption="Certificates"
            columns={columnsFor(timezone)}
            rows={items}
            rowKey={(row) => row.id}
            busy={query.isPlaceholderData}
          />
        )}
        <Pagination
          page={shownPage}
          pageSize={pageSize}
          total={total}
          onPageChange={goToPage}
          disabled={query.isPlaceholderData}
        />
      </>
    )
  }

  return (
    <section>
      <h1>Certificates</h1>
      {content}
    </section>
  )
}
