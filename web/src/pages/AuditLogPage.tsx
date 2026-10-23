import { Link, useSearchParams } from 'react-router'
import { AUDIT_ACTIONS, type AuditAction, type AuditEvent } from '@cert/shared'
import { DataTable, type Column } from '../components/DataTable'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import {
  actionLabels,
  auditDetail,
  auditSearchParams,
  parseAuditParams,
  useAuditEvents,
  type AuditPageParams,
} from '../features/audit/api'
import { useCourses } from '../features/courses/api'
import { formatInTimeZone } from '../lib/dates'

function columnsFor(timeZone: string): Column<AuditEvent>[] {
  return [
    {
      key: 'time',
      header: 'Time',
      cell: (e) => <time dateTime={e.occurredAt}>{formatInTimeZone(e.occurredAt, timeZone)}</time>,
    },
    {
      key: 'action',
      header: 'Action',
      cell: (e) => {
        const detail = auditDetail(e.details)
        return (
          <>
            {actionLabels[e.action]}
            {detail && <span className="audit-detail"> — “{detail}”</span>}
          </>
        )
      },
    },
    { key: 'actor', header: 'By', cell: (e) => e.actor.name },
    { key: 'course', header: 'Course', cell: (e) => e.courseTitle },
    { key: 'participant', header: 'Participant', cell: (e) => e.participantName },
    {
      key: 'serial',
      header: 'Serial',
      cell: (e) => <Link to={`/certificates/${e.certificateId}`}>{e.serial}</Link>,
    },
  ]
}

export function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseAuditParams(searchParams)
  const query = useAuditEvents({ courseId: params.courseId, action: params.action, page: params.page })
  const courses = useCourses()
  const filtered = Boolean(params.courseId || params.action)

  function update(change: Partial<AuditPageParams>) {
    // A filter change starts again at page 1
    setSearchParams(auditSearchParams({ ...params, page: 1, ...change }))
  }

  let content
  if (query.isPending) {
    content = <LoadingState label="Loading audit log…" />
  } else if (query.isError) {
    content = (
      <ErrorState
        title="Couldn’t load the audit log"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (query.data.total === 0) {
    content = filtered ? (
      <EmptyState
        title="No events match these filters"
        action={
          <button type="button" onClick={() => update({ courseId: undefined, action: undefined })}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState title="No audit events yet" description="Issuing or revoking a certificate adds an event here." />
    )
  } else {
    const { items, total, pageSize, timezone, page: shownPage } = query.data
    content = (
      <>
        {items.length === 0 ? (
          <EmptyState
            title={`No events on page ${shownPage}`}
            action={
              <button type="button" onClick={() => update({ page: 1 })}>
                Go to the first page
              </button>
            }
          />
        ) : (
          <DataTable
            caption="Audit events"
            columns={columnsFor(timezone)}
            rows={items}
            rowKey={(e) => e.id}
            busy={query.isPlaceholderData}
          />
        )}
        <Pagination
          page={shownPage}
          pageSize={pageSize}
          total={total}
          onPageChange={(page) => update({ page })}
          disabled={query.isPlaceholderData}
        />
      </>
    )
  }

  return (
    <section>
      <h1>Audit log</h1>
      <div className="toolbar">
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
        <label>
          Action
          <select
            value={params.action ?? ''}
            onChange={(event) => update({ action: (event.target.value || undefined) as AuditAction | undefined })}
          >
            <option value="">All</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {actionLabels[action]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {content}
    </section>
  )
}
