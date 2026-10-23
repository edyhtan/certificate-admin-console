import { NDJSON_CONTENT_TYPE } from '@cert/shared';
import type { Response } from 'express';

/**
 * Writes NDJSON lines to an HTTP response. If the client goes away the writer stops writing
 * but never throws, so the work behind the stream finishes anyway (spec §5.2).
 */
export class NdjsonWriter {
  constructor(private readonly res: Response) {
    // A write to a closed socket emits 'error'; the run carries on without the client.
    res.on('error', () => undefined);
  }

  /** 200 with the NDJSON content type, sent right away so the client sees progress. */
  start(): void {
    this.res.status(200);
    this.res.setHeader('Content-Type', `${NDJSON_CONTENT_TYPE}; charset=utf-8`);
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

  /** Writes one line, waiting for the socket to drain when its buffer is full. */
  async write(event: unknown): Promise<void> {
    if (!this.connected) return;
    const ok = this.res.write(`${JSON.stringify(event)}\n`);
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
