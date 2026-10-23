import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { NdjsonWriter } from './ndjson-writer.js';

/** A minimal stand-in for an Express response that records what was written. */
class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  written: string[] = [];
  destroyed = false;
  writableEnded = false;
  flushed = false;
  /** What `write` returns: false means the buffer is full. */
  writeReturns = true;

  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  flushHeaders() {
    this.flushed = true;
  }
  write(chunk: string) {
    this.written.push(chunk);
    return this.writeReturns;
  }
  end() {
    this.writableEnded = true;
  }
}

const writerFor = (res: FakeResponse) => new NdjsonWriter(res as unknown as Response);

describe('NdjsonWriter', () => {
  it('starts a 200 NDJSON response and sends the headers at once', () => {
    const res = new FakeResponse();
    writerFor(res).start();
    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    });
    expect(res.flushed).toBe(true);
  });

  it('writes one JSON object per line, keeping non-ASCII as is', async () => {
    const res = new FakeResponse();
    const writer = writerFor(res);
    await writer.write({ type: 'start', total: 2 });
    await writer.write({ participantName: 'Bảo Nguyễn' });
    expect(res.written).toEqual(['{"type":"start","total":2}\n', '{"participantName":"Bảo Nguyễn"}\n']);
  });

  it('waits for drain when the buffer is full', async () => {
    const res = new FakeResponse();
    res.writeReturns = false;
    let done = false;
    const pending = writerFor(res).write({ n: 1 }).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    res.emit('drain');
    await pending;
    expect(done).toBe(true);
  });

  it('stops waiting when the client goes away mid-drain', async () => {
    const res = new FakeResponse();
    res.writeReturns = false;
    const pending = writerFor(res).write({ n: 1 });
    res.destroyed = true;
    res.emit('close');
    await expect(pending).resolves.toBeUndefined();
  });

  it('skips writes and end once the client has gone, without throwing', async () => {
    const res = new FakeResponse();
    const writer = writerFor(res);
    res.destroyed = true;
    expect(writer.connected).toBe(false);
    await writer.write({ n: 1 });
    writer.end();
    expect(res.written).toEqual([]);
    expect(res.writableEnded).toBe(false);
  });

  it('swallows socket errors so the run keeps going', () => {
    const res = new FakeResponse();
    writerFor(res);
    expect(() => res.emit('error', new Error('EPIPE'))).not.toThrow();
  });

  it('ends the response', () => {
    const res = new FakeResponse();
    writerFor(res).end();
    expect(res.writableEnded).toBe(true);
  });
});
