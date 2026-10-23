import type { ReactNode } from 'react'
import { errorMessage } from '../api/errors'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  /** e.g. a "Clear search" button */
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {description && <p className="state-description">{description}</p>}
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  /** Any thrown value; shown with `errorMessage`. */
  error: unknown
  title?: string
  onRetry?: () => void
  /** Disable the retry button while a retry is in flight. */
  retrying?: boolean
}

export function ErrorState({ error, title = 'Something went wrong', onRetry, retrying = false }: ErrorStateProps) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{title}</p>
      <p className="state-description">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  )
}
