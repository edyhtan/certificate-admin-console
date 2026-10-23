import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { idSchema, type CertificateDetail } from '@cert/shared'
import { ApiError } from '../api/errors'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { AuditTrail } from '../features/audit/AuditTrail'
import { RevokeDialog } from '../features/certificates/RevokeDialog'
import { useCertificate, useRevokeCertificate } from '../features/certificates/api'
import { formatInTimeZone } from '../lib/dates'

/** `:id` from the URL, or null when it can't be a certificate id. */
function parseId(value: string | undefined): number | null {
  const parsed = idSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const backLink = <Link to="/certificates">Back to certificates</Link>

export function CertificateDetailPage() {
  const id = parseId(useParams().id)
  const query = useCertificate(id)

  let content
  if (id === null || (query.isError && query.error instanceof ApiError && query.error.isNotFound)) {
    content = (
      <EmptyState
        title="Certificate not found"
        description="It may have been mistyped, or it belongs to another tenant."
        action={backLink}
      />
    )
  } else if (query.isPending) {
    content = <LoadingState label="Loading certificate…" />
  } else if (query.isError) {
    content = (
      <ErrorState
        title="Couldn’t load this certificate"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else {
    // Keyed by id: moving to another certificate starts a fresh view, so an open revoke
    // dialog or a "revoked" notice can't carry over to it.
    return <CertificateView key={query.data.id} certificate={query.data} />
  }

  return (
    <section>
      <p>{backLink}</p>
      <h1>Certificate</h1>
      {content}
    </section>
  )
}

function CertificateView({ certificate }: { certificate: CertificateDetail }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [justRevoked, setJustRevoked] = useState(false)
  const revoke = useRevokeCertificate(certificate.id)
  const tz = certificate.timezone

  function openDialog() {
    revoke.reset()
    setDialogOpen(true)
  }

  function confirmRevoke(reason: string | undefined) {
    revoke.mutate(reason, {
      onSuccess: () => {
        setDialogOpen(false)
        setJustRevoked(true)
      },
    })
  }

  return (
    <section>
      <p>{backLink}</p>
      <div className="page-heading">
        <h1>{certificate.serial}</h1>
        <StatusBadge status={certificate.status} />
      </div>

      {justRevoked && (
        <p className="notice" role="status">
          Certificate revoked.
        </p>
      )}

      <dl className="details">
        <dt>Serial</dt>
        <dd>{certificate.serial}</dd>
        <dt>Participant</dt>
        <dd>{certificate.participantName}</dd>
        <dt>Course</dt>
        <dd>{certificate.courseTitle}</dd>
        <dt>Issued</dt>
        <dd>{formatInTimeZone(certificate.issuedAt, tz)}</dd>
        <dt>Issued by</dt>
        <dd>{certificate.issuedBy.name}</dd>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={certificate.status} />
        </dd>
        {certificate.status === 'revoked' && (
          <>
            <dt>Revoked</dt>
            <dd>{formatInTimeZone(certificate.revokedAt, tz)}</dd>
            <dt>Revoked by</dt>
            <dd>{certificate.revokedBy?.name ?? '—'}</dd>
            <dt>Reason</dt>
            <dd>{certificate.revokeReason ?? 'No reason given'}</dd>
          </>
        )}
      </dl>
      <p className="timezone-note">Times are in {tz}.</p>

      {certificate.status === 'valid' && (
        <button type="button" className="danger" onClick={openDialog}>
          Revoke
        </button>
      )}

      <AuditTrail certificateId={certificate.id} />

      {dialogOpen && (
        <RevokeDialog
          serial={certificate.serial}
          pending={revoke.isPending}
          error={revoke.error}
          onConfirm={confirmRevoke}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </section>
  )
}
