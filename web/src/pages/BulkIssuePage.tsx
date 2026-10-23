import { useEffect } from 'react'
import { Link, useBlocker, useSearchParams } from 'react-router'
import { idSchema, type IssuanceResultEvent, type SkipReason } from '@cert/shared'
import { ApiError, errorMessage } from '../api/errors'
import { DataTable, type Column } from '../components/DataTable'
import { ErrorState, LoadingState } from '../components/states'
import { useCourses } from '../features/courses/api'
import { useIssuancePreview } from '../features/issuances/api'
import { countOutcomes, StreamEndedEarlyError, useIssuanceRun } from '../features/issuances/useIssuanceRun'

const skipReasons: Record<SkipReason, string> = {
  already_issued: 'Already has a certificate',
  revoked: 'Certificate was revoked',
}

const outcomeLabels = { issued: 'Issued', skipped: 'Skipped', failed: 'Failed' } as const

const resultColumns: Column<IssuanceResultEvent>[] = [
  { key: 'participant', header: 'Participant', cell: (r) => r.participantName },
  {
    key: 'outcome',
    header: 'Outcome',
    cell: (r) => <span className={`badge badge-outcome-${r.outcome}`}>{outcomeLabels[r.outcome]}</span>,
  },
  {
    key: 'details',
    header: 'Details',
    cell: (r) =>
      r.outcome === 'issued' ? r.serial : r.outcome === 'skipped' ? skipReasons[r.reason] : r.message,
  },
]

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function BulkIssuePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsedCourse = idSchema.safeParse(searchParams.get('courseId') ?? undefined)
  const courseId = parsedCourse.success ? parsedCourse.data : null

  const courses = useCourses()
  const preview = useIssuancePreview(courseId)
  const { state: run, start, reset } = useIssuanceRun()
  const running = run.status === 'running'

  // Warn before leaving mid-run, inside the app and when closing the tab
  const blocker = useBlocker(running)
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  function chooseCourse(value: string) {
    reset()
    setSearchParams(value ? { courseId: value } : {}, { replace: true })
  }

  const counts = countOutcomes(run.results)
  const processed = run.results.length
  const courseTitle = courses.data?.find((c) => c.id === courseId)?.title
  const eligible = preview.data?.eligible ?? 0
  const runForThisCourse = run.status !== 'idle' && run.courseId === courseId
  const startedStreaming = run.total !== null

  return (
    <section>
      <h1>Bulk issue</h1>
      <p className="page-intro">
        Issue certificates to every learner who completed a course. Running it again is safe: learners who already have
        a certificate are skipped.
      </p>

      {courses.isError ? (
        <ErrorState title="Couldn’t load courses" error={courses.error} onRetry={() => void courses.refetch()} />
      ) : (
        <div className="toolbar">
          <label>
            Course
            <select
              value={courseId ?? ''}
              disabled={running || courses.isPending}
              onChange={(event) => chooseCourse(event.target.value)}
            >
              <option value="">{courses.isPending ? 'Loading courses…' : 'Choose a course'}</option>
              {courses.data?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {courseId !== null && (
        <div className="panel">
          {preview.isPending ? (
            <LoadingState label="Counting eligible learners…" />
          ) : preview.isError ? (
            <ErrorState
              title={
                preview.error instanceof ApiError && preview.error.isNotFound
                  ? 'Course not found'
                  : 'Couldn’t count eligible learners'
              }
              error={preview.error}
              onRetry={() => void preview.refetch()}
            />
          ) : (
            <>
              <p className="preview-counts">
                {plural(preview.data.completed, 'learner has', 'learners have')} completed {courseTitle ?? 'this course'};{' '}
                {preview.data.alreadyIssued} already {preview.data.alreadyIssued === 1 ? 'has' : 'have'} a certificate.
              </p>
              <button
                type="button"
                className="primary"
                disabled={running || eligible === 0 || preview.isFetching}
                onClick={() => void start(courseId)}
              >
                {running ? 'Issuing…' : eligible === 0 ? 'Nothing to issue' : `Issue ${plural(eligible, 'certificate', 'certificates')}`}
              </button>
            </>
          )}
        </div>
      )}

      {runForThisCourse && (
        <div className="panel">
          {startedStreaming && (
            <div className="progress">
              <progress
                aria-label="Bulk issue progress"
                value={processed}
                max={run.total ?? undefined}
              />
              <span>
                {processed} / {run.total} processed
              </span>
            </div>
          )}
          {running && !startedStreaming && <LoadingState label="Starting…" />}

          {run.status === 'done' && run.summary && (
            <p className="notice" role="status">
              Done: {run.summary.issued} issued, {run.summary.skipped} skipped, {run.summary.failed} failed.
            </p>
          )}

          {run.status === 'interrupted' && (
            <div className="state state-error" role="alert">
              <p className="state-title">
                {startedStreaming ? `The run stopped after ${processed} of ${run.total} learners` : 'The run didn’t start'}
              </p>
              <p className="state-description">
                {run.error instanceof StreamEndedEarlyError ? `${run.error.message}.` : errorMessage(run.error)}
              </p>
              {startedStreaming && (
                <p className="state-description">
                  Everything processed so far is saved. Running again is safe: learners who already have a certificate
                  are skipped.
                </p>
              )}
            </div>
          )}

          {(run.status === 'done' || run.status === 'interrupted') && (
            <div className="run-actions">
              <button type="button" onClick={() => void start(courseId!)}>
                Run again
              </button>
              {run.status === 'done' && run.summary && run.summary.failed > 0 && (
                <span className="hint">Failed learners are tried again on the next run.</span>
              )}
            </div>
          )}

          {run.results.length > 0 && (
            <>
              <p className="outcome-counts" aria-live="polite">
                {counts.issued} issued · {counts.skipped} skipped · {counts.failed} failed
              </p>
              <DataTable
                caption="Results per learner"
                columns={resultColumns}
                rows={run.results}
                rowKey={(r) => r.enrollmentId}
              />
            </>
          )}
        </div>
      )}

      {blocker.state === 'blocked' && (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title">
            <h2 id="leave-title">Leave while issuing?</h2>
            <p>
              The server keeps issuing, but this page will stop showing progress. You can come back and run it again to
              see what was done.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => blocker.reset()}>
                Stay
              </button>
              <button type="button" className="danger" onClick={() => blocker.proceed()}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {!courses.isError && courses.data?.length === 0 && (
        <p>
          There are no courses yet. <Link to="/certificates">Back to certificates</Link>
        </p>
      )}
    </section>
  )
}
