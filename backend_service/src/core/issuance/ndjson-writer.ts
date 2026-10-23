import { NDJSON_CONTENT_TYPE } from '@cert/shared';
import type { Response } from 'express';
import { StreamWriter } from '../http/stream-writer.js';

/**
 * Writes NDJSON lines to an HTTP response. If the client goes away the writer stops writing
 * but never throws, so the work behind the stream finishes anyway (spec §5.2).
 */
export class NdjsonWriter {
  private readonly stream: StreamWriter;

  constructor(res: Response) {
    this.stream = new StreamWriter(res);
  }

  /** 200 with the NDJSON content type, sent right away so the client sees progress. */
  start(): void {
    this.stream.start({ 'Content-Type': `${NDJSON_CONTENT_TYPE}; charset=utf-8` });
  }

  get connected(): boolean {
    return this.stream.connected;
  }

  /** Writes one event as one line. */
  write(event: unknown): Promise<void> {
    return this.stream.write(`${JSON.stringify(event)}\n`);
  }

  end(): void {
    this.stream.end();
  }
}
