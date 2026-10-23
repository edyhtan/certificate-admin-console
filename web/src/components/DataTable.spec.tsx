import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DataTable, type Column } from './DataTable'

interface Row {
  id: number
  name: string
  count: number
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => <strong>{row.name}</strong> },
  { key: 'count', header: 'Count', cell: (row) => row.count, align: 'end' },
]

const rows: Row[] = [
  { id: 1, name: "Ana O'Neil", count: 3 },
  { id: 2, name: 'Bao Nguyễn', count: 0 },
]

describe('DataTable', () => {
  it('renders headers and one row per item, in order', () => {
    render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} />)
    const table = screen.getByRole('table', { name: 'People' })
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Name', 'Count'])

    const bodyRows = within(table).getAllByRole('row').slice(1)
    expect(bodyRows).toHaveLength(2)
    expect(within(bodyRows[0]).getAllByRole('cell').map((td) => td.textContent)).toEqual(["Ana O'Neil", '3'])
    expect(within(bodyRows[1]).getAllByRole('cell').map((td) => td.textContent)).toEqual(['Bao Nguyễn', '0'])
  })

  it('aligns end columns', () => {
    render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.getByRole('columnheader', { name: 'Count' })).toHaveClass('align-end')
    expect(screen.getByRole('cell', { name: '3' })).toHaveClass('align-end')
  })

  it('renders an empty body for no rows', () => {
    render(<DataTable caption="People" columns={columns} rows={[]} rowKey={(r) => r.id} />)
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('marks the table busy only while busy', () => {
    const { rerender } = render(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy')
    rerender(<DataTable caption="People" columns={columns} rows={rows} rowKey={(r) => r.id} busy />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
  })
})
