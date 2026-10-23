import { EventEmitter } from 'node:events';
import type { IssuanceEvent } from '@cert/shared';
import type { Response } from 'express';
import { NotFoundError } from '../../common/errors/app-error.js';
import { IssuanceController } from './issuance.controller.js';
import type { IssuanceService, PreparedRun } from './issuance.service.js';

class FakeResponse extends EventEmitter {
  written: string[] = [];
  destroyed = false;
  writableEnded = false;
  status() {
    return this;
  }
  setHeader() {}
  flushHeaders() {}
  write(chunk: string) {
    this.written.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
  }
}

const prepared: PreparedRun = { course: { id: 1, title: 'T' }, candidates: [] };

describe('IssuanceController', () => {
  it('previews through the service', async () => {
    const service = { preview: vi.fn().mockResolvedValue({ courseId: 1 }) };
    const controller = new IssuanceController(service as unknown as IssuanceService);
    await expect(controller.preview({ courseId: 1 })).resolves.toEqual({ courseId: 1 });
    expect(service.preview).toHaveBeenCalledWith(1);
  });

  it('streams every event of the run as a line, then ends', async () => {
    const events: IssuanceEvent[] = [
      { type: 'start', total: 0 },
      { type: 'done', issued: 0, skipped: 0, failed: 0 },
    ];
    const service = {
      prepare: vi.fn().mockResolvedValue(prepared),
      run: vi.fn(async function* () {
        yield* events;
      }),
    };
    const res = new FakeResponse();
    await new IssuanceController(service as unknown as IssuanceService).issue(
      { courseId: 1 },
      res as unknown as Response,
    );
    expect(service.prepare).toHaveBeenCalledWith(1);
    expect(service.run).toHaveBeenCalledWith(prepared);
    expect(res.written).toEqual(events.map((e) => `${JSON.stringify(e)}\n`));
    expect(res.writableEnded).toBe(true);
  });

  it('lets a failed check through before writing anything', async () => {
    const service = { prepare: vi.fn().mockRejectedValue(new NotFoundError('Course not found')) };
    const res = new FakeResponse();
    await expect(
      new IssuanceController(service as unknown as IssuanceService).issue(
        { courseId: 9 },
        res as unknown as Response,
      ),
    ).rejects.toThrow('Course not found');
    expect(res.written).toEqual([]);
  });

  it('keeps consuming the run after the client disconnects', async () => {
    const res = new FakeResponse();
    let consumed = 0;
    const service = {
      prepare: vi.fn().mockResolvedValue(prepared),
      run: vi.fn(async function* () {
        for (let i = 0; i < 3; i++) {
          consumed++;
          if (i === 1) res.destroyed = true;
          yield { type: 'start', total: i } as IssuanceEvent;
        }
      }),
    };
    await new IssuanceController(service as unknown as IssuanceService).issue(
      { courseId: 1 },
      res as unknown as Response,
    );
    expect(consumed).toBe(3);
    expect(res.written).toHaveLength(1);
  });
});
