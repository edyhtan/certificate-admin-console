import { certificateListResponseSchema, TENANT_HEADER } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetToSydneySeed } from './support/db.js';
import { createCertificate, createCourse, createEnrollment, createParticipant } from './support/factories.js';
import { createTestApp } from './support/test-app.js';

const C = SYDNEY_SEED.certificates;
type Row = { id: number; serial: string; participantName: string; courseTitle: string; issuedAt: string };

describe('Certificate search, filters and sort (e2e)', () => {
  let app: INestApplication;
  const list = async (query: Record<string, string | number>) => {
    const res = await request(app.getHttpServer())
      .get('/api/certificates')
      .set(TENANT_HEADER, 'SYD')
      .query({ pageSize: 100, ...query });
    return res;
  };
  const serials = async (query: Record<string, string | number>) =>
    (await list(query)).body.items.map((c: Row) => c.serial);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  describe('search (q)', () => {
    it('finds a name ignoring case and accents (nguyen → Nguyễn)', async () => {
      const res = await list({ q: 'nguyen' });
      expect(res.status).toBe(200);
      const body = certificateListResponseSchema.parse(res.body);
      expect(body.total).toBe(1);
      expect(body.items[0].participantName).toBe('Bảo Nguyễn');
    });

    it.each(['NGUYỄN', 'Nguyen', 'bảo', 'chloe', 'MULLER'])('finds %j', async (q) => {
      expect((await list({ q })).body.total).toBe(1);
    });

    it('matches part of a name, including an apostrophe', async () => {
      expect(await serials({ q: "o'nei" })).toEqual([C.newYear.serial]);
    });

    it('matches a serial prefix in any case', async () => {
      expect(await serials({ q: 'syd-2026-00000' })).toHaveLength(6);
      expect(await serials({ q: 'syd-2026-000003' })).toEqual([C.dstEndBefore.serial]);
    });

    it('does not match the middle of a serial', async () => {
      expect((await list({ q: '2026-000003' })).body.total).toBe(0);
    });

    it('treats % and _ as plain characters, not wildcards', async () => {
      expect((await list({ q: '%' })).body.total).toBe(0);
      expect((await list({ q: '_' })).body.total).toBe(0);
      const p = await createParticipant({ firstName: 'Fifty', lastName: '50%_Off' });
      await createCertificate({ enrollment: await createEnrollment({ participant: p }) });
      expect((await list({ q: '50%_' })).body.total).toBe(1);
    });

    it('returns an empty page with total 0 when nothing matches', async () => {
      const res = await list({ q: 'zzzz-nobody' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0, page: 1 });
    });

    it('ignores a blank search', async () => {
      expect((await list({ q: '   ' })).body.total).toBe(6);
    });
  });

  describe('filters', () => {
    it('filters by status', async () => {
      expect(await serials({ status: 'revoked' })).toEqual([C.revoked.serial]);
      expect((await list({ status: 'valid' })).body.total).toBe(5);
    });

    it('filters by course', async () => {
      const res = await list({ courseId: SYDNEY_SEED.courseIds['WHS-201'] });
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((c: Row) => c.courseTitle === 'Workplace Health and Safety')).toBe(true);
    });

    it('combines search, status and course; total counts only matches', async () => {
      const res = await list({ q: 'syd', status: 'valid', courseId: SYDNEY_SEED.courseIds['FA-101'] });
      expect(res.body.items.map((c: Row) => c.serial)).toEqual([C.dstEndBefore.serial, C.newYear.serial]);
      expect(res.body.total).toBe(2);
    });

    it.each([
      [{ status: 'pending' }, 'status'],
      [{ courseId: 'abc' }, 'courseId'],
    ])('rejects %j with 400', async (query, field) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(res.body.fields).toHaveProperty(field);
    });
  });

  describe('sort', () => {
    it.each([
      ['participant_name', (r: Row) => r.participantName],
      ['serial', (r: Row) => r.serial],
      ['course_title', (r: Row) => r.courseTitle],
      ['issued_at', (r: Row) => r.issuedAt],
    ] as const)('sorts by %s both ways', async (sort, key) => {
      for (const order of ['asc', 'desc'] as const) {
        const rows: Row[] = (await list({ sort, order })).body.items;
        const values = rows.map(key);
        const expected = [...values].sort((a, b) =>
          sort === 'issued_at' || sort === 'serial'
            ? a.localeCompare(b, 'en')
            : a.localeCompare(b, 'en', { sensitivity: 'base' }),
        );
        expect(values, `${sort} ${order}`).toEqual(order === 'asc' ? expected : expected.reverse());
      }
    });

    it('sorts names ignoring case and accents, like the collation', async () => {
      const names = (await list({ sort: 'participant_name' })).body.items.map((r: Row) => r.participantName);
      expect(names).toEqual([
        "Ana O'Neil",
        'Bảo Nguyễn',
        'Chloé Dubois',
        'Mateo García',
        'Oliver Smith',
        'Zoë Müller',
      ]);
    });

    it('defaults to newest issued first', async () => {
      expect((await serials({}))[0]).toBe(C.dstStartAfter.serial);
    });

    it.each(['issuedAt', 'id', 'participant_name;DROP', 'status'])('rejects sort %j with 400', async (sort) => {
      const res = await list({ sort });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_failed', fields: { sort: expect.any(String) } });
    });

    it('rejects an unknown order with 400', async () => {
      expect((await list({ order: 'up' })).status).toBe(400);
    });
  });

  describe('stable paging with equal sort keys', () => {
    it('pages through equal course titles in id order without repeats or gaps', async () => {
      const course = await createCourse({ title: 'Same Title' });
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) {
        const e = await createEnrollment({ course });
        ids.push((await createCertificate({ enrollment: e })).id);
      }
      const seen: number[] = [];
      for (const page of [1, 2, 3]) {
        const res = await list({ courseId: course.id, sort: 'course_title', order: 'desc', page, pageSize: 2 });
        seen.push(...res.body.items.map((r: Row) => r.id));
      }
      expect(seen).toEqual([...ids].reverse());
    });

    it('pages through equal names in id order (asc)', async () => {
      const ids: number[] = [];
      for (let i = 0; i < 4; i++) {
        const p = await createParticipant({ firstName: 'Twin', lastName: 'Same' });
        ids.push((await createCertificate({ enrollment: await createEnrollment({ participant: p }) })).id);
      }
      const seen: number[] = [];
      for (const page of [1, 2]) {
        const res = await list({ q: 'twin same', sort: 'participant_name', page, pageSize: 2 });
        seen.push(...res.body.items.map((r: Row) => r.id));
      }
      expect(seen).toEqual(ids);
    });
  });
});
