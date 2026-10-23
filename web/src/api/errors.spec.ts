import { describe, expect, it } from 'vitest'
import { ApiError, errorFromResponse, errorMessage } from './errors'

describe('errorFromResponse', () => {
  it('reads the API error shape', async () => {
    const response = new Response(
      JSON.stringify({ error: 'duplicate', message: 'Already in use', fields: { email: 'Taken' } }),
      { status: 409 },
    )
    const error = await errorFromResponse(response)
    expect(error).toMatchObject({ status: 409, code: 'duplicate', message: 'Already in use', fields: { email: 'Taken' } })
  })

  it('falls back to not_found for a 404 without the API shape', async () => {
    const error = await errorFromResponse(new Response('nope', { status: 404 }))
    expect(error).toMatchObject({ status: 404, code: 'not_found', message: 'Not found' })
  })

  it('does not trust an error code outside the contract', async () => {
    const response = new Response(JSON.stringify({ error: 'teapot', message: 'I am a teapot' }), { status: 418 })
    const error = await errorFromResponse(response)
    expect(error).toMatchObject({ status: 418, code: 'internal_error', message: 'Request failed (418)' })
  })

  it('falls back to internal_error for JSON that is not the API shape', async () => {
    const error = await errorFromResponse(new Response(JSON.stringify({ msg: 'x' }), { status: 500 }))
    expect(error).toMatchObject({ status: 500, code: 'internal_error', message: 'Request failed (500)' })
  })
})

describe('errorMessage', () => {
  it('uses the API message', () => {
    expect(errorMessage(new ApiError(404, 'not_found', 'Certificate not found'))).toBe('Certificate not found')
  })

  it('explains network errors', () => {
    expect(errorMessage(new ApiError(0, 'network_error', 'Network request failed'))).toBe(
      'Can’t reach the server. Check your connection.',
    )
  })

  it('uses a plain Error message, or a generic one', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom')
    expect(errorMessage('weird')).toBe('Something went wrong.')
    expect(errorMessage(new Error(''))).toBe('Something went wrong.')
  })
})
