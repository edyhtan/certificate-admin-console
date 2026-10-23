import { createCourseRequestSchema } from './courses.js';
import { createParticipantRequestSchema } from './participants.js';

const fieldsOf = (result: {
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('createCourseRequestSchema', () => {
  it('trims and upper-cases the code, trims the title', () => {
    expect(
      createCourseRequestSchema.parse({ code: '  fa-101 ', title: '  First Aid ' }),
    ).toEqual({ code: 'FA-101', title: 'First Aid' });
  });

  it.each(['A', 'X'.repeat(21), 'FA 101', 'FA_101', 'CAFÉ'])(
    'rejects code %j',
    (code) => {
      expect(
        fieldsOf(createCourseRequestSchema.safeParse({ code, title: 'T' })).code,
      ).toBe('must be 2–20 letters, digits or hyphens');
    },
  );

  it('accepts codes of 2 and 20 characters', () => {
    expect(createCourseRequestSchema.safeParse({ code: 'ab', title: 'T' }).success).toBe(
      true,
    );
    expect(
      createCourseRequestSchema.safeParse({ code: 'A'.repeat(20), title: 'T' }).success,
    ).toBe(true);
  });

  it('requires both fields, and a title that is not blank', () => {
    expect(fieldsOf(createCourseRequestSchema.safeParse({}))).toEqual({
      code: 'is required',
      title: 'is required',
    });
    expect(
      fieldsOf(createCourseRequestSchema.safeParse({ code: 'AB', title: '   ' })).title,
    ).toBe('is required');
  });

  it('rejects a title over 200 characters', () => {
    expect(
      fieldsOf(
        createCourseRequestSchema.safeParse({ code: 'AB', title: 'x'.repeat(201) }),
      ).title,
    ).toBe('must be 200 characters or less');
  });
});

describe('createParticipantRequestSchema', () => {
  const valid = { firstName: 'Ana', lastName: "O'Neil", email: 'ana@example.com' };

  it('trims and lower-cases the email', () => {
    expect(
      createParticipantRequestSchema.parse({ ...valid, email: '  Ana@Example.COM ' })
        .email,
    ).toBe('ana@example.com');
  });

  it('keeps accents and apostrophes in names, trimmed', () => {
    expect(
      createParticipantRequestSchema.parse({
        ...valid,
        firstName: '  Bảo ',
        lastName: ' Nguyễn ',
      }),
    ).toMatchObject({ firstName: 'Bảo', lastName: 'Nguyễn' });
  });

  it.each(['not-an-email', 'ana@', '@example.com', 'ana example@x.com'])(
    'rejects email %j',
    (email) => {
      expect(
        fieldsOf(createParticipantRequestSchema.safeParse({ ...valid, email })).email,
      ).toBe('must be a valid email address');
    },
  );

  it('requires every field, and names that are not blank', () => {
    expect(fieldsOf(createParticipantRequestSchema.safeParse({}))).toEqual({
      firstName: 'is required',
      lastName: 'is required',
      email: 'is required',
    });
    expect(
      fieldsOf(createParticipantRequestSchema.safeParse({ ...valid, lastName: ' ' }))
        .lastName,
    ).toBe('is required');
  });

  it('rejects names over 100 characters', () => {
    expect(
      fieldsOf(
        createParticipantRequestSchema.safeParse({
          ...valid,
          firstName: 'x'.repeat(101),
        }),
      ).firstName,
    ).toBe('must be 100 characters or less');
  });
});
