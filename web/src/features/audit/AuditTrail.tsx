import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatInTimeZone } from '../../lib/dates'
import { actionLabels, auditDetail, useAuditEvents } from './api'

/** Every audit event of one certificate, newest first (certificate detail page). */
export function AuditTrail({ certificateId }: { certificateId: number }) {
  // A certificate has a handful of events (issued, maybe revoked), so one page of 100 is all of them
  const query = useAuditEvents({ certificateId, pageSize: 100 })

  let content
  if (query.isPending) {
    content = <LoadingState label="Loading audit trail…" />
  } else if (query.isError) {
    content = (
      <ErrorState
        title="Couldn’t load the audit trail"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (query.data.items.length === 0) {
    content = <EmptyState title="No audit events yet" />
  } else {
    const { items, timezone } = query.data
    content = (
      <ol className="audit-trail">
        {items.map((event) => {
          const detail = auditDetail(event.details)
          return (
            <li key={event.id}>
              <span className={`badge badge-action-${event.action === 'certificate.issued' ? 'issued' : 'revoked'}`}>
                {actionLabels[event.action]}
              </span>{' '}
              <time dateTime={event.occurredAt}>{formatInTimeZone(event.occurredAt, timezone)}</time> by{' '}
              {event.actor.name}
              {detail && <span className="audit-detail"> — “{detail}”</span>}
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <section className="audit-section" aria-labelledby="audit-trail-title">
      <h2 id="audit-trail-title">Audit trail</h2>
      {content}
    </section>
  )
}
