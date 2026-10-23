import { formatInstant, pageLabel, renderFields, renderTable, truncate } from './format.js';

describe('formatInstant', () => {
  it('shows a Perth New Year’s Eve issue on 31 Dec, not in UTC or Sydney time', () => {
    const instant = new Date('2026-12-31T15:30:00.000Z'); // 23:30 in Perth
    expect(formatInstant(instant, 'Australia/Perth')).toBe('2026-12-31 23:30 AWST');
    expect(formatInstant(instant, 'Australia/Sydney')).toBe('2027-01-01 02:30 AEDT');
    expect(formatInstant(instant, 'UTC')).toBe('2026-12-31 15:30 UTC');
  });

  it('follows Sydney daylight saving either side of the October change', () => {
    // Clocks go from 02:00 AEST to 03:00 AEDT on 4 Oct 2026 (15:59:59Z → 16:00Z).
    expect(formatInstant(new Date('2026-10-03T15:30:00Z'), 'Australia/Sydney')).toBe(
      '2026-10-04 01:30 AEST',
    );
    expect(formatInstant(new Date('2026-10-03T16:30:00Z'), 'Australia/Sydney')).toBe(
      '2026-10-04 03:30 AEDT',
    );
  });

  it('handles Adelaide’s half-hour offset', () => {
    expect(formatInstant(new Date('2026-06-01T00:00:00Z'), 'Australia/Adelaide')).toBe(
      '2026-06-01 09:30 ACST',
    );
  });

  it('shows a dash for a missing instant', () => {
    expect(formatInstant(null, 'Australia/Sydney')).toBe('—');
    expect(formatInstant(undefined, 'Australia/Sydney')).toBe('—');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('Ana', 5)).toBe('Ana');
    expect(truncate('Anaïs', 5)).toBe('Anaïs');
  });

  it('cuts long text and ends it with …', () => {
    expect(truncate('Workplace Health and Safety', 10)).toBe('Workplace…');
    expect(truncate('Workplace Health and Safety', 10)).toHaveLength(10);
  });

  it('counts accented letters as one character', () => {
    expect(truncate('Bảo Nguyễn Văn', 10)).toBe('Bảo Nguyễ…');
  });
});

describe('renderTable', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string; n: number }) => r.name },
    { header: 'N', value: (r: { name: string; n: number }) => r.n, align: 'right' as const },
  ];

  it('pads columns to the widest cell and right-aligns numbers', () => {
    expect(
      renderTable(columns, [
        { name: 'Zoë Müller', n: 2 },
        { name: 'Li', n: 10 },
      ]),
    ).toBe(['Name         N', '----------  --', 'Zoë Müller   2', 'Li          10'].join('\n'));
  });

  it('cuts cells longer than the column max', () => {
    const out = renderTable(
      [{ header: 'Title', value: (r: { t: string }) => r.t, max: 8 }],
      [{ t: 'First Aid Essentials' }],
    );
    expect(out.split('\n')[2]).toBe('First A…');
  });

  it('shows the empty text when there are no rows', () => {
    expect(renderTable(columns, [])).toBe('(none)');
    expect(renderTable(columns, [], '(no courses)')).toBe('(no courses)');
  });
});

describe('renderFields', () => {
  it('lines up the values', () => {
    expect(
      renderFields([
        ['Serial', 'SYD-2026-000001'],
        ['Status', 'valid'],
        ['Certificate id', 1],
      ]),
    ).toBe(
      ['Serial          SYD-2026-000001', 'Status          valid', 'Certificate id  1'].join('\n'),
    );
  });
});

describe('pageLabel', () => {
  it('counts pages and rows', () => {
    expect(pageLabel(2, 5, 15)).toBe('Page 2 of 3 (15 rows)');
    expect(pageLabel(1, 15, 1)).toBe('Page 1 of 1 (1 row)');
    expect(pageLabel(1, 15, 0)).toBe('Page 1 of 1 (0 rows)');
  });
});
