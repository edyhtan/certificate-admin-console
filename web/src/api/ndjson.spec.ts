import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readNdjson } from './ndjson'
import { ndjsonStream } from '../test/fetchMock'

const schema = z.object({ n: z.number() })

async function collect<T>(gen: AsyncGenerator<T>) {
  const out: T[] = []
  for await (const value of gen) out.push(value)
  return out
}

describe('readNdjson', () => {
  it('yields each line in order', async () => {
    const stream = ndjsonStream()
    stream.send({ n: 1 }, { n: 2 })
    stream.send({ n: 3 })
    stream.close()
    await expect(collect(readNdjson(stream.response, schema))).resolves.toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('joins lines split across chunks, skips blank lines and reads a last line without a newline', async () => {
    const stream = ndjsonStream()
    stream.sendRaw('{"n":')
    stream.sendRaw('1}\n\n  \n{"n"')
    stream.sendRaw(':2}\n{"n":3}')
    stream.close()
    await expect(collect(readNdjson(stream.response, schema))).resolves.toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('handles multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"name":"Nguyễn"}\n')
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 14)) // splits the ễ
        c.enqueue(bytes.slice(14))
        c.close()
      },
    })
    const result = await collect(readNdjson(new Response(body), z.object({ name: z.string() })))
    expect(result).toEqual([{ name: 'Nguyễn' }])
  })

  it('yields events before the stream ends', async () => {
    const stream = ndjsonStream()
    const gen = readNdjson(stream.response, schema)
    stream.send({ n: 1 })
    await expect(gen.next()).resolves.toEqual({ value: { n: 1 }, done: false })
    stream.close()
    await expect(gen.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('throws invalid_response for a line that is not JSON', async () => {
    const stream = ndjsonStream()
    stream.sendRaw('oops\n')
    stream.close()
    await expect(collect(readNdjson(stream.response, schema))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('throws invalid_response for a line that does not match the schema', async () => {
    const stream = ndjsonStream()
    stream.send({ n: 'one' })
    stream.close()
    await expect(collect(readNdjson(stream.response, schema))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('throws network_error, after the lines already read, when the connection drops', async () => {
    const stream = ndjsonStream()
    const seen: unknown[] = []
    stream.send({ n: 1 })
    const reading = (async () => {
      for await (const value of readNdjson(stream.response, schema)) {
        seen.push(value)
        stream.fail()
      }
    })()
    await expect(reading).rejects.toMatchObject({ status: 0, code: 'network_error' })
    expect(seen).toEqual([{ n: 1 }])
  })

  it('throws for a response without a body', async () => {
    await expect(collect(readNdjson(new Response(null), schema))).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
