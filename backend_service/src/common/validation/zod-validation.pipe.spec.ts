import { z } from 'zod';
import { ValidationFailedError } from '../errors/app-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  code: z.string().trim().toUpperCase().min(2, 'must be at least 2 characters'),
  page: z.coerce.number().int().min(1).default(1),
  address: z.object({ city: z.string().min(1, 'is required') }).optional(),
});

const body = { type: 'body' as const };

function errorFrom(fn: () => unknown): ValidationFailedError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationFailedError) return e;
    throw e;
  }
  throw new Error('expected a ValidationFailedError');
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value with transforms and defaults applied', () => {
    expect(pipe.transform({ code: ' ab ' }, body)).toEqual({
      code: 'AB',
      page: 1,
    });
  });

  it('coerces query strings', () => {
    expect(
      pipe.transform({ code: 'ab', page: '3' }, { type: 'query' }),
    ).toEqual({ code: 'AB', page: 3 });
  });

  it('throws validation_failed with one message per field', () => {
    const e = errorFrom(() => pipe.transform({ code: 'a', page: '0' }, body));
    expect(e.status).toBe(400);
    expect(e.code).toBe('validation_failed');
    expect(e.fields).toEqual({
      code: 'must be at least 2 characters',
      page: expect.any(String),
    });
  });

  it('names nested fields with a dotted path', () => {
    const e = errorFrom(() =>
      pipe.transform({ code: 'ab', address: { city: '' } }, body),
    );
    expect(e.fields).toEqual({ 'address.city': 'is required' });
  });

  it('keeps only the first message for a field', () => {
    const strict = new ZodValidationPipe(
      z.object({ name: z.string().min(3, 'too short').regex(/^x/, 'bad start') }),
    );
    const e = errorFrom(() => strict.transform({ name: 'ab' }, body));
    expect(e.fields).toEqual({ name: 'too short' });
  });

  it('uses the input type as the key when the whole input is wrong', () => {
    const e = errorFrom(() => pipe.transform(undefined, body));
    expect(Object.keys(e.fields ?? {})).toEqual(['body']);
  });
});
