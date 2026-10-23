import type { Response } from 'express';

/**
 * Writes a streamed HTTP response chunk by chunk, waiting for the socket when its buffer is
 * full. If the client goes away it stops writing but never throws; the caller decides whether
 * to carry on (bulk issue does) or stop (CSV export does).
 */
export class StreamWriter {
  constructor(private readonly res: Response) {
    // A write to a closed socket emits 'error'; nothing should crash because of it.
    res.on('error', () => undefined);
  }

  /** 200 with these headers, sent right away so the client sees the response start. */
  start(headers: Record<string, string>): void {
    this.res.status(200);
    for (const [name, value] of Object.entries(headers)) this.res.setHeader(name, value);
    this.res.setHeader('Cache-Control', 'no-store');
    this.res.setHeader('X-Content-Type-Options', 'nosniff');
    // Ask reverse proxies not to buffer the stream.
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders();
  }

  /** False once the client has gone; writing is then skipped. */
  get connected(): boolean {
    return !this.res.destroyed && !this.res.writableEnded;
  }

  async write(chunk: string): Promise<void> {
    if (!this.connected) return;
    const ok = this.res.write(chunk);
    if (!ok && this.connected) {
      await new Promise<void>((resolve) => {
        const done = () => {
          this.res.off('drain', done);
          this.res.off('close', done);
          resolve();
        };
        this.res.on('drain', done);
        this.res.on('close', done);
      });
    }
  }

  end(): void {
    if (this.connected) this.res.end();
  }
}
