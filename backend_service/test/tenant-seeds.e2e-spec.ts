import type { INestApplication } from '@nestjs/common';
import { ADELAIDE_SEED, PERTH_SEED } from '../src/seed/manifest.js';
import { resetDatabase, resetToSeed, testDb } from './support/db.js';
import { api, createTestApp } from './support/test-app.js';

describe('Perth and Adelaide seeds through the API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetToSeed('PER');
    await resetToSeed('ADL');
  });

  afterAll(async () => {
    // Leave the other test files the empty-with-admin state they expect.
    await resetDatabase(testDb('PER'));
    await resetDatabase(testDb('ADL'));
    await app.close();
  });

  describe('Perth: admin and courses only', () => {
    it('lists its 3 courses', async () => {
      const res = await api(app, 'PER').get('/api/courses');
      expect(res.body.items.map((c: { code: string }) => c.code).sort()).toEqual(
        Object.keys(PERTH_SEED.courseIds).sort(),
      );
    });

    it('has no certificates: an empty first page with total 0', async () => {
      const res = await api(app, 'PER').get('/api/certificates');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0, timezone: 'Australia/Perth' });
    });

    it('has nothing to bulk issue and no audit events', async () => {
      const preview = await api(app, 'PER').get('/api/issuances/preview').query({ courseId: 1 });
      expect(preview.body).toEqual({ courseId: 1, completed: 0, alreadyIssued: 0, eligible: 0 });
      expect((await api(app, 'PER').get('/api/audit-events')).body.total).toBe(0);
    });

    it('exports a CSV with only the header row', async () => {
      const res = await api(app, 'PER').get('/api/certificates/export.csv');
      expect(res.text).toBe('﻿learner_name,course_title,serial_number,issue_date,status\r\n');
    });
  });

  describe('Adelaide: the large tenant', () => {
    it('pages through 150 certificates, 20 at a time', async () => {
      const first = await api(app, 'ADL').get('/api/certificates');
      expect(first.body).toMatchObject({ total: 150, pageSize: 20, timezone: 'Australia/Adelaide' });
      expect(first.body.items).toHaveLength(20);
      const last = await api(app, 'ADL').get('/api/certificates').query({ page: 8 });
      expect(last.body.items).toHaveLength(10);
      const past = await api(app, 'ADL').get('/api/certificates').query({ page: 9 });
      expect(past.body.items).toHaveLength(0);
    });

    it('finds names by accent-free search', async () => {
      const res = await api(app, 'ADL').get('/api/certificates').query({ q: 'eloise nguyen' });
      expect(res.body.items.every((c: { participantName: string }) => c.participantName === 'Éloïse Nguyễn')).toBe(true);
    });

    it('previews what is left to issue per course', async () => {
      for (const [code, eligible] of Object.entries(ADELAIDE_SEED.eligibleByCourse)) {
        const res = await api(app, 'ADL').get('/api/issuances/preview').query({ courseId: ADELAIDE_SEED.courseIds[code] });
        expect(res.body.eligible, code).toBe(eligible);
      }
    });

    it('exports all 150 rows', async () => {
      const res = await api(app, 'ADL').get('/api/certificates/export.csv');
      expect(res.text.trim().split('\r\n')).toHaveLength(1 + 150);
    });
  });
});
