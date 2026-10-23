import type { z } from 'zod'
import { ApiError } from './errors'

/**
 * Reads a newline-delimited JSON response (`application/x-ndjson`) and yields each line parsed
 * with `schema`, as the lines arrive. Lines can be split across network chunks.
 * A line that isn't JSON or doesn't match throws `ApiError` (`invalid_response`); a dropped
 * connection rethrows the read error as `network_error`.
 */
export async function* readNdjson<S extends z.ZodType>(
  response: Response,
  schema: S,
): AsyncGenerator<z.output<S>, void, undefined> {
  if (!response.body) throw new ApiError(response.status, 'invalid_response', 'The server sent no data')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  const parseLine = (line: string): z.output<S> => {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new ApiError(response.status, 'invalid_response', 'The server sent a line that isn’t JSON')
    }
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      throw new ApiError(response.status, 'invalid_response', 'The server sent an update this app doesn’t understand')
    }
    return parsed.data
  }

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<string>
      try {
        chunk = await reader.read()
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
        throw new ApiError(0, 'network_error', 'The connection dropped')
      }
      if (chunk.done) break
      buffer += chunk.value
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) yield parseLine(line)
        newline = buffer.indexOf('\n')
      }
    }
    const last = buffer.trim()
    if (last) yield parseLine(last)
  } finally {
    reader.releaseLock()
  }
}
