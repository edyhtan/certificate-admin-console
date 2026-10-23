import { pageCount } from '../lib/pagination'

export interface PaginationProps {
  /** 1-based, as the API counts. */
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  /** Disable both buttons, e.g. while the next page loads. */
  disabled?: boolean
}

/** "21–40 of 45" with Previous / Next. Renders nothing when there are no rows. */
export function Pagination({ page, pageSize, total, onPageChange, disabled = false }: PaginationProps) {
  const pages = pageCount(total, pageSize)
  if (pages === 0) return null

  const first = Math.min((page - 1) * pageSize + 1, total)
  const last = Math.min(page * pageSize, total)
  const beyondEnd = page > pages

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-range">
        {beyondEnd ? `No rows on page ${page}` : `${first}–${last} of ${total}`}
      </span>
      {/* Past the end (e.g. a stale link), Previous jumps to the last page. */}
      <button type="button" onClick={() => onPageChange(Math.min(page - 1, pages))} disabled={disabled || page <= 1}>
        Previous
      </button>
      <span className="pagination-page">
        Page {page} of {pages}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= pages}>
        Next
      </button>
    </nav>
  )
}
