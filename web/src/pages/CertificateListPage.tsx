import { Link, useSearchParams } from 'react-router'
import {
  CERTIFICATE_STATUSES,
  MAX_SEARCH_LENGTH,
  certificateSortSchema,
  type CertificateStatus,
  type CertificateSummary,
} from '@cert/shared'
import { DataTable, type Column } from '../components/DataTable'
import { Pagination } from '../components/Pagination'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useCertificateList } from '../features/certificates/api'
import {
  filterQuery,
  hasFilters,
  nextSort,
  parseListParams,
  toSearchParams,
  type ListParams,
} from '../features/certificates/listParams'
import { useCourses } from '../features/courses/api'
import { formatDateInTimeZone } from '../lib/dates'

const statusLabels: Record<CertificateStatus, string> = { valid: 'Valid', revoked: 'Revoked' }

function columnsFor(timeZone: string): Column<CertificateSummary>[] {
  return [
    {
      key: 'serial',
      header: 'Serial',
      sortKey: 'serial',
      cell: (row) => <Link to={`/certificates/${row.id}`}>{row.serial}</Link>,
    },
    { key: 'participant', header: 'Participant', sortKey: 'participant_name', cell: (row) => row.participantName },
    { key: 'course', header: 'Course', sortKey: 'course_title', cell: (row) => row.courseTitle },
    {
      key: 'issued',
      header: 'Issue date',
      sortKey: 'issued_at',
      cell: (row) => formatDateInTimeZone(row.issuedAt, timeZone),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  ]
}

export function CertificateListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseListParams(searchParams)
  const query = useCertificateList({ ...filterQuery(params), page: params.page })
  const courses = useCourses()

  function update(change: Partial<ListParams>, { keepPage = false } = {}) {
    // Any change other than paging starts again at page 1
    setSearchParams(toSearchParams({ ...params, ...change, page: keepPage ? (change.page ?? params.page) : 1 }))
  }

  function clearSearchAndFilters() {
    update({ q: undefined, status: undefined, courseId: undefined })
  }

  const sort = {
    key: params.sort,
    order: params.order,
    onSort: (key: string) => update(nextSort(params, certificateSortSchema.parse(key))),
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
  } else if (query.data.total === 0 && hasFilters(params)) {
    content = (
      <EmptyState
        title={params.q ? `No results for “${params.q}”` : 'No certificates match these filters'}
        description="Try another search, or clear it to see every certificate."
        action={
          <button type="button" onClick={clearSearchAndFilters}>
            Clear search and filters
          </button>
        }
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
              <button type="button" onClick={() => update({ page: 1 }, { keepPage: true })}>
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
            sort={sort}
          />
        )}
        <Pagination
          page={shownPage}
          pageSize={pageSize}
          total={total}
          onPageChange={(page) => update({ page }, { keepPage: true })}
          disabled={query.isPlaceholderData}
        />
      </>
    )
  }

  return (
    <section>
      <div className="page-heading">
        <h1>Certificates</h1>
        <div className="page-actions">
          <Link className="button-link" to="/bulk-issue">
            Issue certificates
          </Link>
        </div>
      </div>

      <div className="toolbar" role="search">
        <SearchBox
          label="Search certificates"
          placeholder="Search by participant name or serial"
          value={params.q ?? ''}
          maxLength={MAX_SEARCH_LENGTH}
          onSearch={(q) => update({ q: q || undefined })}
        />
        <label>
          Status
          <select
            value={params.status ?? ''}
            onChange={(event) => update({ status: (event.target.value || undefined) as CertificateStatus | undefined })}
          >
            <option value="">All</option>
            {CERTIFICATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Course
          <select
            value={params.courseId ?? ''}
            disabled={courses.isPending}
            onChange={(event) => update({ courseId: event.target.value ? Number(event.target.value) : undefined })}
          >
            <option value="">{courses.isError ? 'All (couldn’t load courses)' : 'All'}</option>
            {courses.data?.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {content}
    </section>
  )
}
