import { lastPage, MAX_PAGE_SIZE, normalisePage, WRITE_OPERATIONS } from './queries.js';

describe('normalisePage', () => {
  it('defaults to page 1 with 15 rows', () => {
    expect(normalisePage()).toEqual({ page: 1, pageSize: 15, skip: 0 });
  });

  it('works out the offset', () => {
    expect(normalisePage({ page: 3, pageSize: 5 })).toEqual({ page: 3, pageSize: 5, skip: 10 });
  });

  it('clamps out-of-range values', () => {
    expect(normalisePage({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: 1, skip: 0 });
    expect(normalisePage({ page: -4, pageSize: 1000 })).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      skip: 0,
    });
    expect(normalisePage({ page: 2.7, pageSize: 4.9 })).toEqual({ page: 2, pageSize: 4, skip: 4 });
  });
});

describe('lastPage', () => {
  it('is at least 1', () => {
    expect(lastPage(0, 15)).toBe(1);
    expect(lastPage(15, 15)).toBe(1);
    expect(lastPage(16, 15)).toBe(2);
  });
});

describe('WRITE_OPERATIONS', () => {
  it('covers every Prisma write, including raw execute', () => {
    for (const op of ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$executeRaw', '$executeRawUnsafe']) {
      expect(WRITE_OPERATIONS.has(op)).toBe(true);
    }
  });

  it('leaves reads allowed', () => {
    for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', '$queryRaw']) {
      expect(WRITE_OPERATIONS.has(op)).toBe(false);
    }
  });
});
