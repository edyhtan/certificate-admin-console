import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { CertificateExportService } from './certificate-export.service.js';
import { CertificatesController } from './certificates.controller.js';
import type { CertificatesService } from './certificates.service.js';

class FakeResponse extends EventEmitter {
  headers: Record<string, string> = {};
  written: string[] = [];
  destroyed = false;
  writableEnded = false;
  status() {
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.written.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
  }
}

describe('CertificatesController', () => {
  const service = { list: vi.fn(), get: vi.fn(), revoke: vi.fn() };

  it('revokes by the validated id with the validated body', async () => {
    service.revoke.mockResolvedValue({ id: 7, status: 'revoked' });
    await expect(controller.revoke({ id: 7 }, { reason: 'typo' })).resolves.toEqual({
      id: 7,
      status: 'revoked',
    });
    expect(service.revoke).toHaveBeenCalledWith(7, { reason: 'typo' });
  });
  const exporter = {
    filename: vi.fn().mockReturnValue('certificates-SYD-2026-10-22.csv'),
    chunks: vi.fn(async function* (): AsyncGenerator<string> {
      yield 'a\r\n';
      yield 'b\r\n';
    }),
  };
  const controller = new CertificatesController(
    service as unknown as CertificatesService,
    exporter as unknown as CertificateExportService,
  );

  it('streams the export as a CSV attachment', async () => {
    const res = new FakeResponse();
    const query = { sort: 'issued_at', order: 'desc' } as const;
    await controller.export(query, res as unknown as Response);
    expect(exporter.chunks).toHaveBeenCalledWith(query);
    expect(res.headers).toMatchObject({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="certificates-SYD-2026-10-22.csv"',
    });
    expect(res.written).toEqual(['a\r\n', 'b\r\n']);
    expect(res.writableEnded).toBe(true);
  });

  it('stops reading the export once the client has gone', async () => {
    const res = new FakeResponse();
    let read = 0;
    exporter.chunks.mockImplementationOnce(async function* (): AsyncGenerator<string> {
      for (let i = 0; i < 5; i++) {
        read++;
        if (i === 1) res.destroyed = true;
        yield `${i}\r\n`;
      }
    });
    await controller.export({ sort: 'issued_at', order: 'desc' }, res as unknown as Response);
    expect(res.written).toEqual(['0\r\n']);
    expect(read).toBe(2);
  });

  it('lists with the validated query', async () => {
    service.list.mockResolvedValue({ items: [] });
    const query = { page: 2, pageSize: 10, sort: 'serial', order: 'asc' } as const;
    await controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('gets by the validated id', async () => {
    service.get.mockResolvedValue({ id: 7 });
    await expect(controller.get({ id: 7 })).resolves.toEqual({ id: 7 });
    expect(service.get).toHaveBeenCalledWith(7);
  });
});
