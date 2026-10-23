import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SearchBox, SEARCH_DEBOUNCE_MS } from './SearchBox'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function type(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

describe('SearchBox', () => {
  it('reports once, 300 ms after the last change, trimmed', () => {
    const onSearch = vi.fn()
    render(<SearchBox label="Search" value="" onSearch={onSearch} />)
    type('a')
    act(() => vi.advanceTimersByTime(200))
    type('an')
    act(() => vi.advanceTimersByTime(200))
    type('ana ')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1))
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('ana')
  })

  it('does not report text equal to the applied value', () => {
    const onSearch = vi.fn()
    render(<SearchBox label="Search" value="ana" onSearch={onSearch} />)
    type('ana  ')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('reports clearing the box', () => {
    const onSearch = vi.fn()
    render(<SearchBox label="Search" value="ana" onSearch={onSearch} />)
    type('')
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('')
  })

  it('follows the value when it changes outside (Back, clear)', () => {
    const { rerender } = render(<SearchBox label="Search" value="ana" onSearch={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('ana')
    rerender(<SearchBox label="Search" value="" onSearch={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('does not report after unmounting', () => {
    const onSearch = vi.fn()
    const { unmount } = render(<SearchBox label="Search" value="" onSearch={onSearch} />)
    type('ana')
    unmount()
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS))
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('has its label and limit', () => {
    render(<SearchBox label="Search certificates" value="" onSearch={() => {}} maxLength={100} />)
    expect(screen.getByRole('searchbox', { name: 'Search certificates' })).toHaveAttribute('maxLength', '100')
  })
})
