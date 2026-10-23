import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe.js';
import { createTestApp } from './support/test-app.js';

const echoSchema = z.object({
  email: z.email('must be a valid email'),
  name: z.string().trim().min(1, 'is required'),
});

/** Test-only routes, so the error shape can be checked over real HTTP. */
@Controller('_test')
class SampleController {
  @Post('echo')
  echo(@Body(new ZodValidationPipe(echoSchema)) body: z.output<typeof echoSchema>) {
    return body;
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2');
  }
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [SampleController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('answers 200 ok and is not cached', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is only served under the /api prefix', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(404);
    });
  });

  describe('error shape', () => {
    it('unknown route → 404 not_found', async () => {
      const res = await request(app.getHttpServer()).get('/api/nope');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: 'not_found',
        message: 'Cannot GET /api/nope',
      });
    });

    it('bad body → 400 validation_failed with per-field messages', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/_test/echo')
        .send({ email: 'not-an-email', name: '  ' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'validation_failed',
        message: 'Some fields are not valid',
        fields: { email: 'must be a valid email', name: 'is required' },
      });
    });

    it('good body → parsed value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/_test/echo')
        .send({ email: 'ana@example.com', name: ' Ana ' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ email: 'ana@example.com', name: 'Ana' });
    });

    it('malformed JSON → 400 bad_request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/_test/echo')
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'bad_request',
        message: expect.stringContaining('JSON'),
      });
    });

    it('body over the parser limit → 413 payload_too_large', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/_test/echo')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.co', name: 'x'.repeat(200_000) }));
      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: 'payload_too_large',
        message: 'request entity too large',
      });
    });

    it('unexpected error → 500 internal_error without the details', async () => {
      const res = await request(app.getHttpServer()).get('/api/_test/boom');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: 'internal_error',
        message: 'Something went wrong',
      });
      expect(JSON.stringify(res.body)).not.toContain('hunter2');
    });
  });
});
