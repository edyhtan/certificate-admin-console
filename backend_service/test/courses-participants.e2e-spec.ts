import {
  apiErrorBodySchema,
  courseListResponseSchema,
  courseSchema,
  participantSchema,
  TENANT_HEADER,
} from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetDatabase, resetToSydneySeed, testDb } from './support/db.js';
import { createTestApp } from './support/test-app.js';

describe('Courses and participants (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  describe('GET /api/courses', () => {
    it('lists the seeded courses by title, in the contract shape', async () => {
      const res = await api().get('/api/courses').set(TENANT_HEADER, 'SYD');
      expect(res.status).toBe(200);
      const body = courseListResponseSchema.parse(res.body);
      expect(body.items).toEqual([
        { id: SYDNEY_SEED.courseIds['FA-101'], code: 'FA-101', title: 'First Aid Essentials' },
        { id: SYDNEY_SEED.courseIds['LDR-301'], code: 'LDR-301', title: 'Leading Teams' },
        {
          id: SYDNEY_SEED.courseIds['WHS-201'],
          code: 'WHS-201',
          title: 'Workplace Health and Safety',
        },
      ]);
    });

    it('returns an empty list when there are no courses', async () => {
      await resetDatabase();
      const res = await api().get('/api/courses');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });
  });

  describe('POST /api/courses', () => {
    it('creates a course, trimming and upper-casing the code', async () => {
      const res = await api()
        .post('/api/courses')
        .set(TENANT_HEADER, 'SYD')
        .send({ code: '  fa-201 ', title: '  Advanced First Aid ' });
      expect(res.status).toBe(201);
      expect(courseSchema.parse(res.body)).toEqual({
        id: 4,
        code: 'FA-201',
        title: 'Advanced First Aid',
      });
      const list = await api().get('/api/courses');
      expect(list.body.items.map((c: { code: string }) => c.code)).toContain('FA-201');
    });

    it('answers 409 naming code for an existing code in any case', async () => {
      const res = await api()
        .post('/api/courses')
        .send({ code: 'fa-101', title: 'Another First Aid' });
      expect(res.status).toBe(409);
      expect(apiErrorBodySchema.parse(res.body)).toEqual({
        error: 'duplicate',
        message: 'This value is already in use',
        fields: { code: 'is already in use' },
      });
      expect(await testDb().course.count()).toBe(SYDNEY_SEED.counts.courses);
    });

    it('answers 400 with a message per bad field', async () => {
      const res = await api().post('/api/courses').send({ code: 'A', title: '   ' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'validation_failed',
        message: 'Some fields are not valid',
        fields: {
          code: 'must be 2–20 letters, digits or hyphens',
          title: 'is required',
        },
      });
    });

    it('answers 400 for a missing body', async () => {
      const res = await api().post('/api/courses');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
    });

    it('answers 400 bad_request for malformed JSON', async () => {
      const res = await api()
        .post('/api/courses')
        .set('Content-Type', 'application/json')
        .send('{"code":');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    });
  });

  describe('POST /api/participants', () => {
    it('creates a participant, lower-casing the email and keeping accents', async () => {
      const res = await api()
        .post('/api/participants')
        .set(TENANT_HEADER, 'SYD')
        .send({ firstName: ' Thảo ', lastName: "D'Arcy-Lê", email: '  Thao.Le@Example.COM ' });
      expect(res.status).toBe(201);
      expect(participantSchema.parse(res.body)).toEqual({
        id: SYDNEY_SEED.counts.participants + 1,
        firstName: 'Thảo',
        lastName: "D'Arcy-Lê",
        email: 'thao.le@example.com',
      });
      const row = await testDb().participant.findUniqueOrThrow({
        where: { email: 'thao.le@example.com' },
      });
      expect(row.lastName).toBe("D'Arcy-Lê");
    });

    it('answers 409 naming email for a seeded email in another case', async () => {
      const res = await api()
        .post('/api/participants')
        .send({ firstName: 'Ana', lastName: 'Two', email: 'ANA.ONEIL@example.com' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'duplicate',
        message: 'This value is already in use',
        fields: { email: 'is already in use' },
      });
      expect(await testDb().participant.count()).toBe(SYDNEY_SEED.counts.participants);
    });

    it('answers 400 with a message per bad field', async () => {
      const res = await api()
        .post('/api/participants')
        .send({ firstName: '', email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'validation_failed',
        message: 'Some fields are not valid',
        fields: {
          firstName: 'is required',
          lastName: 'is required',
          email: 'must be a valid email address',
        },
      });
    });
  });
});
