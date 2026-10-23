import {
  certificateDetailSchema,
  certificateExportQuerySchema,
  certificateListQuerySchema,
  certificateListResponseSchema,
  revokeCertificateRequestSchema,
} from './certificates.js';

const fieldsOf = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('certificateListQuerySchema', () => {
  it('fills defaults: page 1, pageSize 20, newest issued first', () => {
    expect(certificateListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sort: 'issued_at',
      order: 'desc',
    });
  });

  it('treats empty query parameters as not given', () => {
    expect(
      certificateListQuerySchema.parse({
        q: '',
        status: '',
        courseId: '',
        sort: '',
        order: '',
        page: '',
        pageSize: '',
      }),
    ).toEqual({ page: 1, pageSize: 20, sort: 'issued_at', order: 'desc' });
  });

  it('coerces query strings', () => {
    expect(
      certificateListQuerySchema.parse({
        q: '  Ana ',
        status: 'revoked',
        courseId: '3',
        sort: 'serial',
        order: 'desc',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      q: 'Ana',
      status: 'revoked',
      courseId: 3,
      sort: 'serial',
      order: 'desc',
      page: 2,
      pageSize: 50,
    });
  });

  it.each(['participant_name', 'serial', 'course_title'] as const)(
    'sorts %s A→Z by default',
    (sort) => {
      expect(certificateListQuerySchema.parse({ sort }).order).toBe('asc');
    },
  );

  it('keeps an explicit order for issued_at', () => {
    expect(
      certificateListQuerySchema.parse({ sort: 'issued_at', order: 'asc' }),
    ).toMatchObject({ sort: 'issued_at', order: 'asc' });
  });

  it.each(['issuedAt', 'id', 'participant_name; DROP TABLE', 'ISSUED_AT'])(
    'rejects sort %j (whitelist only)',
    (sort) => {
      const result = certificateListQuerySchema.safeParse({ sort });
      expect(result.success).toBe(false);
      expect(fieldsOf(result).sort).toBe(
        'must be one of issued_at, participant_name, serial, course_title',
      );
    },
  );

  it('rejects an unknown order', () => {
    expect(
      fieldsOf(certificateListQuerySchema.safeParse({ order: 'up' })).order,
    ).toBe('must be asc or desc');
  });

  it.each([
    ['101', 'must be 100 or less'],
    ['0', 'must be 1 or more'],
    ['2.5', 'must be a whole number'],
    ['ten', 'must be a number'],
  ])('rejects pageSize %s', (pageSize, message) => {
    expect(
      fieldsOf(certificateListQuerySchema.safeParse({ pageSize })).pageSize,
    ).toBe(message);
  });

  it('accepts pageSize 100, the maximum', () => {
    expect(certificateListQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(
      100,
    );
  });

  it('rejects page 0', () => {
    expect(fieldsOf(certificateListQuerySchema.safeParse({ page: '0' })).page).toBe(
      'must be 1 or more',
    );
  });

  it('rejects an unknown status and a bad course id', () => {
    const result = certificateListQuerySchema.safeParse({
      status: 'pending',
      courseId: '-1',
    });
    expect(Object.keys(fieldsOf(result)).sort()).toEqual(['courseId', 'status']);
  });

  it('drops a search that is only spaces', () => {
    expect(certificateListQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('rejects a search over 100 characters', () => {
    expect(
      fieldsOf(certificateListQuerySchema.safeParse({ q: 'x'.repeat(101) })).q,
    ).toBe('must be 100 characters or less');
  });

  it('keeps accents and apostrophes in the search', () => {
    expect(certificateListQuerySchema.parse({ q: "Nguyễn O'Neil" }).q).toBe(
      "Nguyễn O'Neil",
    );
  });
});

describe('certificateExportQuerySchema', () => {
  it('takes the same filters and sort as the list', () => {
    expect(
      certificateExportQuerySchema.parse({
        q: 'ana',
        status: 'valid',
        courseId: '2',
        sort: 'course_title',
      }),
    ).toEqual({
      q: 'ana',
      status: 'valid',
      courseId: 2,
      sort: 'course_title',
      order: 'asc',
    });
  });

  it('ignores paging', () => {
    expect(
      certificateExportQuerySchema.parse({ page: '3', pageSize: '10' }),
    ).toEqual({ sort: 'issued_at', order: 'desc' });
  });

  it('rejects an unknown sort like the list does', () => {
    expect(certificateExportQuerySchema.safeParse({ sort: 'x' }).success).toBe(
      false,
    );
  });
});

describe('revokeCertificateRequestSchema', () => {
  it.each([undefined, null, {}])('accepts a missing body (%j)', (body) => {
    expect(revokeCertificateRequestSchema.parse(body)).toEqual({});
  });

  it('trims the reason and drops a blank one', () => {
    expect(revokeCertificateRequestSchema.parse({ reason: '  typo  ' })).toEqual({
      reason: 'typo',
    });
    expect(revokeCertificateRequestSchema.parse({ reason: '   ' })).toEqual({});
  });

  it('rejects a reason over 500 characters', () => {
    expect(
      fieldsOf(
        revokeCertificateRequestSchema.safeParse({ reason: 'x'.repeat(501) }),
      ).reason,
    ).toBe('must be 500 characters or less');
  });
});

describe('certificate responses', () => {
  const summary = {
    id: 1,
    serial: 'SYD-2026-000001',
    participantId: 2,
    participantName: "Ana O'Neil",
    courseId: 3,
    courseTitle: 'First Aid',
    status: 'valid',
    issuedAt: '2026-12-31T15:30:00.000Z',
    revokedAt: null,
  };

  it('accepts a list page with the tenant timezone', () => {
    expect(
      certificateListResponseSchema.safeParse({
        items: [summary],
        page: 1,
        pageSize: 20,
        total: 1,
        timezone: 'Australia/Sydney',
      }).success,
    ).toBe(true);
  });

  it('requires instants in UTC (Z), not local offsets', () => {
    expect(
      certificateListResponseSchema.safeParse({
        items: [{ ...summary, issuedAt: '2027-01-01T02:30:00+11:00' }],
        page: 1,
        pageSize: 20,
        total: 1,
        timezone: 'Australia/Sydney',
      }).success,
    ).toBe(false);
  });

  it('accepts a revoked detail with who and why', () => {
    expect(
      certificateDetailSchema.safeParse({
        ...summary,
        status: 'revoked',
        revokedAt: '2027-01-02T00:00:00.000Z',
        enrollmentId: 4,
        issuedBy: { id: 1, name: 'Administrator' },
        revokedBy: { id: 1, name: 'Administrator' },
        revokeReason: 'Name misspelt',
        timezone: 'Australia/Sydney',
      }).success,
    ).toBe(true);
  });
});
