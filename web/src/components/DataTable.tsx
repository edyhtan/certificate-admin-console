import type { ReactNode } from 'react'

export interface Column<T> {
  /** Unique per table; also used as the React key. */
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'start' | 'end'
  /** Set to make the header a sort button for this key. */
  sortKey?: string
}

export interface TableSort {
  key: string
  order: 'asc' | 'desc'
  onSort: (key: string) => void
}

export interface DataTableProps<T> {
  /** Accessible name of the table. */
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** True while newer rows are loading and the current ones are kept on screen. */
  busy?: boolean
  /** The current sort, for columns with a `sortKey`. */
  sort?: TableSort
}

function HeaderCell<T>({ column, sort }: { column: Column<T>; sort?: TableSort }) {
  const className = column.align === 'end' ? 'align-end' : undefined
  if (!sort || !column.sortKey) {
    return (
      <th scope="col" className={className}>
        {column.header}
      </th>
    )
  }
  const sortKey = column.sortKey
  const active = sort.key === sortKey
  const ariaSort = active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th scope="col" className={className} aria-sort={ariaSort}>
      <button type="button" className="sort-button" onClick={() => sort.onSort(sortKey)}>
        {column.header}
        <span className="sort-indicator" aria-hidden="true">
          {active ? (sort.order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

/** A plain table. Loading, empty and error states are the caller's (see states.tsx). */
export function DataTable<T>({ caption, columns, rows, rowKey, busy = false, sort }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table" aria-busy={busy || undefined}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <HeaderCell key={column.key} column={column} sort={sort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === 'end' ? 'align-end' : undefined}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
