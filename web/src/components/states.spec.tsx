import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/errors'
import { EmptyState, ErrorState, LoadingState } from './states'

describe('LoadingState', () => {
  it('announces a default label', () => {
    render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('uses a custom label', () => {
    render(<LoadingState label="Loading certificates…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading certificates…')
  })
})

describe('EmptyState', () => {
  it('shows title, description and action', async () => {
    const onClear = vi.fn()
    render(
      <EmptyState
        title="No results"
        description="Nothing matches “zz”."
        action={<button onClick={onClear}>Clear search</button>}
      />,
    )
    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.getByText('Nothing matches “zz”.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('renders with a title only', () => {
    const { container } = render(<EmptyState title="No certificates yet" />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('shows the error message as an alert and retries', async () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new ApiError(500, 'internal_error', 'Server exploded')} onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(alert).toHaveTextContent('Server exploded')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('explains network errors', () => {
    render(<ErrorState error={new ApiError(0, 'network_error', 'Network request failed')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the server')
  })

  it('has no retry button without onRetry', () => {
    render(<ErrorState error={new Error('x')} title="Couldn’t load" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('disables retry while retrying', () => {
    render(<ErrorState error={new Error('x')} onRetry={() => {}} retrying />)
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled()
  })
})
