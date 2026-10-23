import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={0} onPageChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the range on the first page with Previous disabled', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={1} pageSize={20} total={45} onPageChange={onPageChange} />)
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('shows a partial last page with Next disabled', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={3} pageSize={20} total={45} onPageChange={onPageChange} />)
    expect(screen.getByText('41–45 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('disables both buttons for a single page', () => {
    render(<Pagination page={1} pageSize={20} total={7} onPageChange={() => {}} />)
    expect(screen.getByText('1–7 of 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('jumps back to the last page from past the end', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={9} pageSize={20} total={45} onPageChange={onPageChange} />)
    expect(screen.getByText('No rows on page 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('disables both buttons while disabled', () => {
    render(<Pagination page={2} pageSize={20} total={45} onPageChange={() => {}} disabled />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
