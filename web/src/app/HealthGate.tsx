import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../api/errors'
import { downChecks, fetchHealth } from '../api/health'
import { LoadingState } from '../components/states'

/** How often to check again while the service isn't ready. */
export const HEALTH_RETRY_MS = 5_000

export interface HealthGateProps {
  children: ReactNode
  /** How often to check again while not ready; tests pass a short one. */
  retryMs?: number
}

/**
 * Shows the app only after `GET /api/health` answers `ok` (D62). Until then it shows why the
 * service isn't ready and checks again every few seconds. Once the app is shown it stays shown
 * and the gate stops checking, so a later blip never unmounts the page someone is working on.
 */
export function HealthGate({ children, retryMs = HEALTH_RETRY_MS }: HealthGateProps) {
  const [ready, setReady] = useState(false)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    enabled: !ready,
    retry: false,
    staleTime: 0,
    refetchInterval: retryMs,
    refetchIntervalInBackground: true,
  })

  if (!ready && health.data?.status === 'ok') setReady(true)
  if (ready || health.data?.status === 'ok') return children

  let content
  if (health.isPending) {
    content = <LoadingState label="Connecting to the service…" />
  } else {
    const down = health.data ? downChecks(health.data) : []
    const reason =
      down.length > 0 ? `The server answered, but these checks are down: ${down.join(', ')}.` : errorMessage(health.error)
    content = (
      <div className="state state-error" role="alert">
        <p className="state-title">The service isn’t ready</p>
        <p className="state-description">{reason}</p>
        <p className="state-description">Checking again every {Math.round(retryMs / 1000)} seconds.</p>
        <button type="button" onClick={() => void health.refetch()} disabled={health.isFetching}>
          {health.isFetching ? 'Checking…' : 'Try again'}
        </button>
      </div>
    )
  }

  return <main className="app-main">{content}</main>
}
