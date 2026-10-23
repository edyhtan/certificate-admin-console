import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HealthReport } from '@cert/shared'
import { HealthGate } from './HealthGate'
import { json, mockFetch, never } from '../test/fetchMock'
import { renderWithQuery } from '../test/render'

const up = { status: 'up', durationMs: 1 } as const
const down = { status: 'down', durationMs: 2000 } as const
const ok: HealthReport = { status: 'ok', checks: { database: up, admin: up } }
const adminDown: HealthReport = { status: 'error', checks: { database: up, admin: down } }

const RETRY_MS = 20

function renderGate() {
  return renderWithQuery(
    <HealthGate retryMs={RETRY_MS}>
      <p>The app</p>
    </HealthGate>,
  )
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('HealthGate', () => {
  it('shows a connecting state, not the app, until health answers', async () => {
    mockFetch(() => never())
    renderGate()
    expect(await screen.findByRole('status')).toHaveTextContent('Connecting to the service…')
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
  })

  it('shows the app once health is ok', async () => {
    const { requests } = mockFetch(() => json(ok))
    renderGate()
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(requests[0].url.pathname).toBe('/api/health')
  })

  it('names the checks that are down, and shows the app once they are up, without a reload', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return calls < 3 ? json(adminDown, 503) : json(ok)
    })
    renderGate()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The service isn’t ready')
    expect(alert).toHaveTextContent('The server answered, but these checks are down: admin.')
    expect(screen.queryByText('The app')).not.toBeInTheDocument()

    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(calls).toBe(3)
  })

  it('says when the server cannot be reached, and Try again checks at once', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return json(ok)
    })
    const user = userEvent.setup()
    renderWithQuery(
      // A long interval, so only the button can trigger the second check
      <HealthGate retryMs={60_000}>
        <p>The app</p>
      </HealthGate>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()
  })

  it('keeps checking while the service is not ready', async () => {
    const { requests } = mockFetch(() => json(adminDown, 503))
    renderGate()
    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(3))
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
  })

  it('stops checking once the app is shown, and keeps it shown even if the cache is cleared', async () => {
    const { requests } = mockFetch(() => json(ok))
    const { queryClient } = renderGate()
    await screen.findByText('The app')

    queryClient.clear()
    await wait(RETRY_MS * 5)
    expect(requests).toHaveLength(1)
    expect(screen.getByText('The app')).toBeInTheDocument()
  })
})
