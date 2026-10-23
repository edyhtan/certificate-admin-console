import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { IssuanceDoneEvent, IssuanceEvent, IssuanceResultEvent } from '@cert/shared'
import { issueCertificates, issuanceKeys } from './api'
import { certificateKeys } from '../certificates/api'

export type RunStatus = 'idle' | 'running' | 'done' | 'interrupted'

export interface RunState {
  status: RunStatus
  courseId: number | null
  /** From the `start` event; null until it arrives. */
  total: number | null
  results: IssuanceResultEvent[]
  /** From the `done` event. */
  summary: IssuanceDoneEvent | null
  /** Why the run stopped early: before the stream started, or mid-stream. */
  error: unknown
}

type Action =
  | { type: 'begin'; courseId: number }
  | { type: 'event'; event: IssuanceEvent }
  | { type: 'interrupted'; error: unknown }
  | { type: 'reset' }

export const initialRunState: RunState = {
  status: 'idle',
  courseId: null,
  total: null,
  results: [],
  summary: null,
  error: null,
}

export function runReducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'begin':
      return { ...initialRunState, status: 'running', courseId: action.courseId }
    case 'event': {
      const { event } = action
      if (event.type === 'start') return { ...state, total: event.total }
      if (event.type === 'result') return { ...state, results: [...state.results, event] }
      return { ...state, status: 'done', summary: event }
    }
    case 'interrupted':
      return { ...state, status: 'interrupted', error: action.error }
    case 'reset':
      return initialRunState
  }
}

/** Counts per outcome from the results received so far. */
export function countOutcomes(results: IssuanceResultEvent[]) {
  const counts = { issued: 0, skipped: 0, failed: 0 }
  for (const result of results) counts[result.outcome] += 1
  return counts
}

export class StreamEndedEarlyError extends Error {
  constructor() {
    super('The server stopped sending updates before the run finished')
    this.name = 'StreamEndedEarlyError'
  }
}

/**
 * One bulk issue run at a time. `start` does nothing while a run is going, so a double click
 * can't send a second request. When a run ends (finished or not), the certificate list, the
 * preview counts and the audit log are refetched.
 */
export function useIssuanceRun() {
  const [state, dispatch] = useReducer(runReducer, initialRunState)
  const running = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  // Leaving the page stops reading; the server finishes the run anyway (spec §5.2)
  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback(
    async (courseId: number) => {
      if (running.current) return
      running.current = true
      const abort = new AbortController()
      controller.current = abort
      dispatch({ type: 'begin', courseId })

      let finished = false
      try {
        for await (const event of issueCertificates(courseId, abort.signal)) {
          dispatch({ type: 'event', event })
          if (event.type === 'done') finished = true
        }
        if (!finished) throw new StreamEndedEarlyError()
      } catch (error) {
        if (!abort.signal.aborted) dispatch({ type: 'interrupted', error })
      } finally {
        running.current = false
        void queryClient.invalidateQueries({ queryKey: certificateKeys.all() })
        void queryClient.invalidateQueries({ queryKey: issuanceKeys.all() })
        void queryClient.invalidateQueries({ queryKey: ['audit'] })
      }
    },
    [queryClient],
  )

  const reset = useCallback(() => {
    if (!running.current) dispatch({ type: 'reset' })
  }, [])

  return { state, start, reset }
}
