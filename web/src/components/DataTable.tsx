import type { ReactNode } from 'react'

export interface Column<T> {
  /** Unique per table; also used as the React key. */
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'start' | 'end'
}

export interface DataTableProps<T> {
  /** Accessible name of the table. */
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** True while newer rows are loading and the current ones are kept on screen. */
  busy?: boolean
}

/** A plain table. Loading, empty and error states are the caller's (see states.tsx). */
export function DataTable<T>({ caption, columns, rows, rowKey, busy = false }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table" aria-busy={busy || undefined}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === 'end' ? 'align-end' : undefined}>
                {column.header}
              </th>
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
