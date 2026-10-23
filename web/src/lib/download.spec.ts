import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filenameFromContentDisposition, saveBlob } from './download'

describe('filenameFromContentDisposition', () => {
  it.each([
    ['attachment; filename="certificates-SYD-2026-10-23.csv"', 'certificates-SYD-2026-10-23.csv'],
    ['attachment; filename=certificates-SYD.csv', 'certificates-SYD.csv'],
    ["attachment; filename*=UTF-8''certificats%20Nguy%E1%BB%85n.csv", 'certificats Nguyễn.csv'],
    ['attachment; filename="fallback.csv"; filename*=UTF-8\'\'real.csv', 'real.csv'],
    ['attachment; filename="../../etc/passwd"', 'passwd'],
    ["attachment; filename*=UTF-8''%E0%A4%A; filename=\"ok.csv\"", 'ok.csv'],
  ])('%s → %s', (header, name) => {
    expect(filenameFromContentDisposition(header)).toBe(name)
  })

  it.each([null, '', 'attachment', 'attachment; filename=""'])('returns null for %j', (header) => {
    expect(filenameFromContentDisposition(header)).toBeNull()
  })
})

describe('saveBlob', () => {
  const createObjectURL = vi.fn(() => 'blob:fake-url')
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
  })

  afterEach(() => {
    vi.useRealTimers()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  it('clicks a temporary download link, then frees the URL', () => {
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
      expect(document.body.contains(this)).toBe(true)
    })
    const blob = new Blob(['a,b\n'], { type: 'text/csv' })

    saveBlob(blob, 'certificates-SYD.csv')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('certificates-SYD.csv')
    expect(clicked[0].href).toBe('blob:fake-url')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })
})
