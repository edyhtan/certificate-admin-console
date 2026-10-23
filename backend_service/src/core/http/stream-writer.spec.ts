import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { StreamWriter } from './stream-writer.js';

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  written: string[] = [];
  destroyed = false;
  writableEnded = false;
  flushed = false;
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

describe('StreamWriter', () => {
  it('starts 200 with the given headers plus no-store, nosniff and no proxy buffering', () => {
    const res = new FakeResponse();
    new StreamWriter(res as unknown as Response).start({ 'Content-Type': 'text/csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual({
      'Content-Type': 'text/csv',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    });
    expect(res.flushed).toBe(true);
  });

  it('writes chunks as given', async () => {
    const res = new FakeResponse();
    const writer = new StreamWriter(res as unknown as Response);
    await writer.write('a,b\r\n');
    expect(res.written).toEqual(['a,b\r\n']);
  });

  it('waits for drain, and stops waiting on close', async () => {
    const res = new FakeResponse();
    res.writeReturns = false;
    const writer = new StreamWriter(res as unknown as Response);
    const first = writer.write('1');
    res.emit('drain');
    await first;
    const second = writer.write('2');
    res.destroyed = true;
    res.emit('close');
    await expect(second).resolves.toBeUndefined();
  });

  it('reports disconnected and skips writes after the client goes', async () => {
    const res = new FakeResponse();
    const writer = new StreamWriter(res as unknown as Response);
    expect(writer.connected).toBe(true);
    res.destroyed = true;
    expect(writer.connected).toBe(false);
    await writer.write('x');
    writer.end();
    expect(res.written).toEqual([]);
    expect(res.writableEnded).toBe(false);
  });
});
