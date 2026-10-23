import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  AppError,
  DuplicateError,
  NotFoundError,
  ValidationFailedError,
} from './app-error.js';
import { toErrorResponse } from './to-error-response.js';

/** Same shape as Prisma's PrismaClientKnownRequestError. */
function prismaError(code: string, meta?: Record<string, unknown>) {
  return Object.assign(new Error(`prisma ${code}`), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta,
  });
}

describe('toErrorResponse', () => {
  describe('AppError', () => {
    it('maps a validation error with its fields', () => {
      expect(
        toErrorResponse(new ValidationFailedError({ email: 'Invalid email' })),
      ).toEqual({
        status: 400,
        body: {
          error: 'validation_failed',
          message: 'Some fields are not valid',
          fields: { email: 'Invalid email' },
        },
      });
    });

    it('maps not found without a fields key', () => {
      const { status, body } = toErrorResponse(
        new NotFoundError('Certificate not found'),
      );
      expect(status).toBe(404);
      expect(body).toEqual({
        error: 'not_found',
        message: 'Certificate not found',
      });
      expect(body).not.toHaveProperty('fields');
    });

    it('maps a duplicate naming the field', () => {
      expect(toErrorResponse(new DuplicateError({ code: 'taken' }))).toEqual({
        status: 409,
        body: {
          error: 'duplicate',
          message: 'This value is already in use',
          fields: { code: 'taken' },
        },
      });
    });

    it('keeps the status and code of any AppError', () => {
      expect(
        toErrorResponse(new AppError(400, 'unknown_tenant', 'Unknown tenant')),
      ).toEqual({
        status: 400,
        body: { error: 'unknown_tenant', message: 'Unknown tenant' },
      });
    });
  });

  describe('Prisma errors', () => {
    it('maps P2002 with an array target to 409 naming each field', () => {
      expect(
        toErrorResponse(prismaError('P2002', { target: ['email'] })),
      ).toEqual({
        status: 409,
        body: {
          error: 'duplicate',
          message: 'This value is already in use',
          fields: { email: 'is already in use' },
        },
      });
    });

    it('maps P2002 with an index named after its field', () => {
      expect(
        toErrorResponse(prismaError('P2002', { target: 'code' })).body.fields,
      ).toEqual({ code: 'is already in use' });
    });

    it('maps P2002 with an internal index name to 409 without fields', () => {
      const { status, body } = toErrorResponse(
        prismaError('P2002', { target: 'certificate_enrollment_id_key' }),
      );
      expect(status).toBe(409);
      expect(body).not.toHaveProperty('fields');
    });

    it('maps P2025 to 404', () => {
      expect(toErrorResponse(prismaError('P2025'))).toEqual({
        status: 404,
        body: { error: 'not_found', message: 'Not found' },
      });
    });

    it('maps other Prisma errors to 500 without leaking the message', () => {
      expect(toErrorResponse(prismaError('P1001'))).toEqual({
        status: 500,
        body: { error: 'internal_error', message: 'Something went wrong' },
      });
    });
  });

  describe('Nest HttpException', () => {
    it('maps an unknown route to not_found with Nest message', () => {
      expect(
        toErrorResponse(new NotFoundException('Cannot GET /api/nope')),
      ).toEqual({
        status: 404,
        body: { error: 'not_found', message: 'Cannot GET /api/nope' },
      });
    });

    it('joins an array of messages', () => {
      const e = new BadRequestException({ message: ['a is bad', 'b is bad'] });
      expect(toErrorResponse(e).body.message).toBe('a is bad; b is bad');
    });

    it('uses a plain string response as the message', () => {
      expect(
        toErrorResponse(new HttpException('Method not allowed', 405)),
      ).toEqual({
        status: 405,
        body: { error: 'method_not_allowed', message: 'Method not allowed' },
      });
    });

    it('maps 413 to payload_too_large', () => {
      expect(toErrorResponse(new PayloadTooLargeException()).body.error).toBe(
        'payload_too_large',
      );
    });

    it('hides 5xx details', () => {
      expect(
        toErrorResponse(new InternalServerErrorException('db password wrong')),
      ).toEqual({
        status: 500,
        body: { error: 'internal_error', message: 'Something went wrong' },
      });
    });
  });

  describe('Express middleware errors', () => {
    it('maps an exposed 400 to bad_request with its message', () => {
      const e = Object.assign(new Error('invalid charset'), {
        status: 400,
        expose: true,
      });
      expect(toErrorResponse(e)).toEqual({
        status: 400,
        body: { error: 'bad_request', message: 'invalid charset' },
      });
    });

    it('maps an exposed 413 to payload_too_large', () => {
      const e = Object.assign(new Error('request entity too large'), {
        statusCode: 413,
        expose: true,
      });
      expect(toErrorResponse(e)).toEqual({
        status: 413,
        body: { error: 'payload_too_large', message: 'request entity too large' },
      });
    });

    it('treats a status error that is not exposed as internal', () => {
      const e = Object.assign(new Error('secret'), { status: 400 });
      expect(toErrorResponse(e).status).toBe(500);
    });
  });

  it.each([new Error('boom'), 'a string', null, undefined, 42])(
    'maps anything else (%s) to 500',
    (thrown) => {
      expect(toErrorResponse(thrown)).toEqual({
        status: 500,
        body: { error: 'internal_error', message: 'Something went wrong' },
      });
    },
  );
});
