import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['valid', 'Valid'],
    ['revoked', 'Revoked'],
  ] as const)('shows %s as “%s” with its style', (status, label) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveClass('badge', `badge-${status}`)
  })
})
