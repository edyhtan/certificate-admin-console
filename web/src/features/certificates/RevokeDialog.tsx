import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { MAX_REVOKE_REASON_LENGTH } from '@cert/shared'
import { errorMessage } from '../../api/errors'

export interface RevokeDialogProps {
  serial: string
  /** True while the revoke request is in flight: every control is disabled. */
  pending: boolean
  /** The last revoke failure, shown inside the dialog. */
  error: unknown
  onConfirm: (reason: string | undefined) => void
  onCancel: () => void
}

/** Asks for confirmation and an optional reason before revoking a certificate. */
export function RevokeDialog({ serial, pending, error, onConfirm, onCancel }: RevokeDialogProps) {
  const [reason, setReason] = useState('')
  const titleId = useId()
  const reasonId = useId()
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    reasonRef.current?.focus()
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const trimmed = reason.trim()
    onConfirm(trimmed === '' ? undefined : trimmed)
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pending) onCancel()
        }}
      >
        <form onSubmit={handleSubmit}>
          <h2 id={titleId}>Revoke {serial}?</h2>
          <p>The certificate will show as revoked. This can’t be undone.</p>
          <label htmlFor={reasonId}>Reason (optional)</label>
          <textarea
            id={reasonId}
            ref={reasonRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REVOKE_REASON_LENGTH}
            rows={3}
            disabled={pending}
          />
          {error != null && (
            <p className="form-error" role="alert">
              Couldn’t revoke: {errorMessage(error)}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="danger" disabled={pending}>
              {pending ? 'Revoking…' : 'Revoke certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
