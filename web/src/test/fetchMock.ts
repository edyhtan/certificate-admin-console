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
