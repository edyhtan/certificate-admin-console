import { certificateExportQuerySchema } from '@cert/shared';
import { buildCertificateQuery, escapeLike } from './certificate-query.js';

/** Builds from raw query-string input, the way the API receives it. */
const build = (raw: Record<string, string> = {}) =>
  buildCertificateQuery(certificateExportQuerySchema.parse(raw));

describe('escapeLike', () => {
  it.each([
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ["O'Neil", "O'Neil"],
    ['Nguyễn', 'Nguyễn'],
  ])('escapes %j as %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('buildCertificateQuery', () => {
  it('defaults to everything, newest first, id as tie-breaker', () => {
    expect(build()).toEqual({
      where: {},
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('searches participant name (contains) or serial (prefix)', () => {
    expect(build({ q: ' nguyen ' }).where).toEqual({
      OR: [{ participantName: { contains: 'nguyen' } }, { serial: { startsWith: 'nguyen' } }],
    });
  });

  it('escapes wildcards in the search', () => {
    expect(build({ q: '50%_off' }).where.OR).toEqual([
      { participantName: { contains: '50\\%\\_off' } },
      { serial: { startsWith: '50\\%\\_off' } },
    ]);
  });

  it('filters by status and course', () => {
    expect(build({ status: 'revoked', courseId: '3' }).where).toEqual({
      status: 'revoked',
      courseId: 3,
    });
  });

  it('combines search and filters', () => {
    expect(build({ q: 'ana', status: 'valid', courseId: '1' }).where).toEqual({
      OR: [{ participantName: { contains: 'ana' } }, { serial: { startsWith: 'ana' } }],
      status: 'valid',
      courseId: 1,
    });
  });

  it.each([
    ['issued_at', 'issuedAt'],
    ['participant_name', 'participantName'],
    ['serial', 'serial'],
    ['course_title', 'courseTitle'],
  ])('sorts %s on %s, both ways, with id in the same direction', (sort, column) => {
    for (const order of ['asc', 'desc']) {
      expect(build({ sort, order }).orderBy).toEqual([{ [column]: order }, { id: order }]);
    }
  });

  it('uses the contract defaults for order: A→Z for text sorts', () => {
    expect(build({ sort: 'participant_name' }).orderBy).toEqual([
      { participantName: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('ignores paging (the list adds skip/take itself)', () => {
    const query = buildCertificateQuery({
      sort: 'serial',
      order: 'asc',
      page: 3,
      pageSize: 10,
    } as never);
    expect(query).not.toHaveProperty('skip');
    expect(query).not.toHaveProperty('take');
  });
});
