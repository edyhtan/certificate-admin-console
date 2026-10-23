import { vi } from 'vitest'

export interface MockRequest {
  method: string
  url: URL
  headers: Record<string, string>
  body: unknown
}

/** Returns the response for one request; throw to simulate a network failure. */
export type MockHandler = (request: MockRequest) => Response | Promise<Response>

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A response that never arrives, for checking loading and pending states. */
export function never(): Promise<Response> {
  return new Promise(() => {})
}

/**
 * Replaces `fetch` with `handler` and records each request. Vitest's `restoreMocks` puts the
 * real `fetch` back after each test.
 */
export function mockFetch(handler: MockHandler) {
  const requests: MockRequest[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request: MockRequest = {
      method: init?.method ?? 'GET',
      url: new URL(String(input), 'http://localhost'),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    requests.push(request)
    return handler(request)
  })
  return { requests, spy }
}

/**
 * A streamed `application/x-ndjson` response the test feeds by hand: `send` writes events
 * (optionally split mid-line), `close` ends the stream, `fail` drops the connection.
 */
export function ndjsonStream() {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }),
    send(...events: unknown[]) {
      controller.enqueue(encoder.encode(events.map((e) => JSON.stringify(e) + '\n').join('')))
    },
    sendRaw(text: string) {
      controller.enqueue(encoder.encode(text))
    },
    close() {
      controller.close()
    },
    fail() {
      controller.error(new TypeError('network error'))
    },
  }
}
