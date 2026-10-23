import { CERTIFICATE_EXPORT_COLUMNS, TENANT_HEADER } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EXPORT_BATCH_SIZE } from '../src/core/certificates/certificate-export.service.js';
import { localDate } from '../src/core/time/local-time.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetToSydneySeed } from './support/db.js';
import { createCertificate, createEnrollment, createParticipant } from './support/factories.js';
import { createTestApp } from './support/test-app.js';

/** A small RFC 4180 reader for checking the export: quoted fields, doubled quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}

const C = SYDNEY_SEED.certificates;
type Query = Record<string, string | number>;

describe('CSV export (e2e)', () => {
  let app: INestApplication;
  let smallBatches: INestApplication;

  const fetchCsv = (target: INestApplication, query: Record<string, string | number> = {}) =>
    request(target.getHttpServer())
      .get('/api/certificates/export.csv')
      .set(TENANT_HEADER, 'SYD')
      .query(query)
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => done(null, text));
      });
  const listTotal = async (query: Record<string, string | number>) =>
    (await request(app.getHttpServer()).get('/api/certificates').query(query)).body.total as number;

  beforeAll(async () => {
    app = await createTestApp();
    smallBatches = await createTestApp({
      configure: (b) => b.overrideProvider(EXPORT_BATCH_SIZE).useValue(2),
    });
  });

  afterAll(async () => {
    await app.close();
    await smallBatches.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  it('answers a CSV attachment named after the tenant and local date', async () => {
    const res = await fetchCsv(app);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    const today = localDate(new Date(), 'Australia/Sydney');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="certificates-SYD-${today}.csv"`,
    );
  });

  it('starts with a UTF-8 BOM and the header row, with CRLF line ends', async () => {
    const res = await fetchCsv(app);
    expect(res.body.startsWith('﻿learner_name,course_title,serial_number,issue_date,status\r\n')).toBe(true);
    expect(res.body.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(res.body.slice(1));
    expect(rows[0]).toEqual([...CERTIFICATE_EXPORT_COLUMNS]);
  });

  it('exports every certificate in list order, with tenant-local issue dates', async () => {
    const rows = parseCsv((await fetchCsv(app)).body.slice(1)).slice(1);
    expect(rows.map((r) => r[2])).toEqual(
      [C.dstStartAfter, C.dstStartBefore, C.dstEndAfter, C.dstEndBefore, C.revoked, C.newYear].map((c) => c.serial),
    );
    const newYear = rows.find((r) => r[2] === C.newYear.serial);
    // Issued 2025-12-31T13:30Z = 00:30 on 1 Jan 2026 in Sydney.
    expect(newYear).toEqual(["Ana O'Neil", 'First Aid Essentials', 'SYD-2026-000001', '2026-01-01', 'valid']);
    const revoked = rows.find((r) => r[2] === C.revoked.serial);
    expect(revoked?.[1]).toBe('First Aid Essentials');
    expect(revoked?.[4]).toBe('revoked');
    expect(rows.find((r) => r[2] === C.dstEndBefore.serial)?.[3]).toBe('2026-04-05');
  });

  it.each<Query>([
    {},
    { q: 'nguyen' },
    { status: 'valid' },
    { courseId: SYDNEY_SEED.courseIds['WHS-201'] },
    { q: 'syd-2026', status: 'valid', sort: 'participant_name', order: 'asc' },
    { q: 'nobody-matches' },
  ])('has as many rows as the list total for %j', async (query) => {
    const rows = parseCsv((await fetchCsv(app, query)).body.slice(1)).slice(1);
    expect(rows).toHaveLength(await listTotal({ ...query, pageSize: 100 }));
  });

  it('sorts like the list', async () => {
    const query = { sort: 'participant_name', order: 'desc' };
    const csvNames = parseCsv((await fetchCsv(app, query)).body.slice(1)).slice(1).map((r) => r[0]);
    const list = await request(app.getHttpServer()).get('/api/certificates').query({ ...query, pageSize: 100 });
    expect(csvNames).toEqual(list.body.items.map((c: { participantName: string }) => c.participantName));
  });

  it('gives the same file with batches of 2 as with batches of 1,000, also with ties', async () => {
    // Equal issue times force the id tie-breaker to carry the cursor across batches.
    const at = new Date('2026-10-20T00:00:00Z');
    for (let i = 0; i < 5; i++) await createCertificate({ issuedAt: at });
    for (const query of [{}, { sort: 'course_title', order: 'asc' }, { status: 'valid' }] as Query[]) {
      const big = (await fetchCsv(app, query)).body;
      const small = (await fetchCsv(smallBatches, query)).body;
      expect(small).toBe(big);
      expect(parseCsv(small.slice(1))).toHaveLength(1 + (await listTotal({ ...query, pageSize: 100 })));
    }
  });

  it('escapes a name starting with = so spreadsheets do not run it', async () => {
    const p = await createParticipant({ firstName: '=HYPERLINK("http://x")', lastName: 'Evil' });
    await createCertificate({ enrollment: await createEnrollment({ participant: p }) });
    const text = (await fetchCsv(app, { q: 'evil' })).body;
    const rows = parseCsv(text.slice(1));
    expect(rows[1][0]).toBe(`'=HYPERLINK("http://x") Evil`);
    expect(text).toContain(`"'=HYPERLINK(""http://x"") Evil"`);
  });

  it('round-trips a name with a comma and quotes, and accents', async () => {
    const p = await createParticipant({ firstName: 'Jo "JJ", Jr', lastName: 'Nguyễn' });
    await createCertificate({ enrollment: await createEnrollment({ participant: p }) });
    const rows = parseCsv((await fetchCsv(app, { q: 'jj' })).body.slice(1));
    expect(rows[1][0]).toBe('Jo "JJ", Jr Nguyễn');
    expect(rows[1]).toHaveLength(5);
  });

  it('answers 400 JSON for an invalid sort, before any CSV', async () => {
    const res = await request(app.getHttpServer()).get('/api/certificates/export.csv').query({ sort: 'id' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({ error: 'validation_failed', fields: { sort: expect.any(String) } });
  });

  it('is not caught by the :id route', async () => {
    const res = await fetchCsv(app);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
  });
});
