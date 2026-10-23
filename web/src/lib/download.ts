/**
 * The file name from a `Content-Disposition` header. Prefers the RFC 5987 `filename*=UTF-8''…`
 * form, then `filename="…"`. Returns null when there is none; path parts are stripped.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  let name: string | null = null
  if (extended) {
    try {
      name = decodeURIComponent(extended[2].trim().replace(/^"|"$/g, ''))
    } catch {
      name = null
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
    if (plain) name = (plain[2] ?? plain[1]).trim()
  }
  if (!name) return null
  const base = name.split(/[\\/]/).pop()!.trim()
  return base || null
}

/** Saves a blob through a temporary link, as a plain link can't send the tenant header (D26). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Give the browser a moment to start the download before freeing the memory
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
