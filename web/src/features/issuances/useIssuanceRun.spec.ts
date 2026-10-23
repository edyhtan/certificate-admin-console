import { describe, expect, it } from 'vitest'
import type { IssuanceResultEvent } from '@cert/shared'
import { countOutcomes, initialRunState, runReducer } from './useIssuanceRun'

const issued: IssuanceResultEvent = { type: 'result', enrollmentId: 1, participantName: 'A', outcome: 'issued', serial: 'SYD-2026-000010' }
const skipped: IssuanceResultEvent = { type: 'result', enrollmentId: 2, participantName: 'B', outcome: 'skipped', reason: 'already_issued' }
const failed: IssuanceResultEvent = { type: 'result', enrollmentId: 3, participantName: 'C', outcome: 'failed', message: 'Lock wait timeout' }

describe('runReducer', () => {
  it('runs through begin → start → results → done', () => {
    let state = runReducer(initialRunState, { type: 'begin', courseId: 4 })
    expect(state).toMatchObject({ status: 'running', courseId: 4, total: null, results: [] })
    state = runReducer(state, { type: 'event', event: { type: 'start', total: 3 } })
    expect(state.total).toBe(3)
    for (const event of [issued, skipped, failed]) state = runReducer(state, { type: 'event', event })
    expect(state.results).toEqual([issued, skipped, failed])
    state = runReducer(state, { type: 'event', event: { type: 'done', issued: 1, skipped: 1, failed: 1 } })
    expect(state).toMatchObject({ status: 'done', summary: { issued: 1, skipped: 1, failed: 1 } })
  })

  it('keeps the results so far when interrupted', () => {
    let state = runReducer(initialRunState, { type: 'begin', courseId: 4 })
    state = runReducer(state, { type: 'event', event: { type: 'start', total: 3 } })
    state = runReducer(state, { type: 'event', event: issued })
    const error = new Error('drop')
    state = runReducer(state, { type: 'interrupted', error })
    expect(state).toMatchObject({ status: 'interrupted', total: 3, results: [issued], error })
  })

  it('a new run starts from scratch; reset goes back to idle', () => {
    let state = runReducer(initialRunState, { type: 'begin', courseId: 4 })
    state = runReducer(state, { type: 'event', event: issued })
    state = runReducer(state, { type: 'begin', courseId: 5 })
    expect(state).toEqual({ ...initialRunState, status: 'running', courseId: 5 })
    expect(runReducer(state, { type: 'reset' })).toEqual(initialRunState)
  })
})

describe('countOutcomes', () => {
  it('counts each outcome', () => {
    expect(countOutcomes([issued, skipped, skipped, failed])).toEqual({ issued: 1, skipped: 2, failed: 1 })
    expect(countOutcomes([])).toEqual({ issued: 0, skipped: 0, failed: 0 })
  })
})
