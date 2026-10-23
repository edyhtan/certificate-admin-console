import { describe, expect, it } from 'vitest'
import { describeTimeZone, formatDateInTimeZone, formatInTimeZone, NO_DATE } from './dates'

describe('formatInTimeZone', () => {
  it('shows a Perth New Year’s Eve issue on 31 Dec, not the UTC date', () => {
    // 23:30 local in Perth (UTC+8, no daylight saving) is 15:30 UTC
    expect(formatInTimeZone('2026-12-31T15:30:00Z', 'Australia/Perth')).toBe(
      '31 Dec 2026, 23:30 AWST',
    )
    expect(formatDateInTimeZone('2026-12-31T15:30:00Z', 'Australia/Perth')).toBe('31 Dec 2026')
  })

  it('shows Sydney’s local New Year when UTC is still the previous year', () => {
    // 00:30 on 1 Jan 2026 in Sydney (AEDT, UTC+11) is 13:30 UTC on 31 Dec 2025
    expect(formatInTimeZone('2025-12-31T13:30:00Z', 'Australia/Sydney')).toBe(
      '1 Jan 2026, 00:30 AEDT',
    )
    expect(formatDateInTimeZone('2025-12-31T13:30:00Z', 'Australia/Sydney')).toBe('1 Jan 2026')
  })

  it('tells apart the two 02:30s when Sydney daylight saving ends (5 Apr 2026)', () => {
    expect(formatInTimeZone('2026-04-04T15:30:00Z', 'Australia/Sydney')).toBe(
      '5 Apr 2026, 02:30 AEDT',
    )
    expect(formatInTimeZone('2026-04-04T16:30:00Z', 'Australia/Sydney')).toBe(
      '5 Apr 2026, 02:30 AEST',
    )
  })

  it('uses Sydney daylight time after it starts (4 Oct 2026)', () => {
    // 01:30 AEST before the switch, 03:30 AEDT after it
    expect(formatInTimeZone('2026-10-03T15:30:00Z', 'Australia/Sydney')).toBe(
      '4 Oct 2026, 01:30 AEST',
    )
    expect(formatInTimeZone('2026-10-03T16:30:00Z', 'Australia/Sydney')).toBe(
      '4 Oct 2026, 03:30 AEDT',
    )
  })

  it('formats the same instant differently per zone', () => {
    const instant = '2026-06-15T00:00:00Z'
    expect(formatInTimeZone(instant, 'Australia/Perth')).toBe('15 June 2026, 08:00 AWST')
    expect(formatInTimeZone(instant, 'Australia/Sydney')).toBe('15 June 2026, 10:00 AEST')
  })

  it('accepts a Date', () => {
    expect(formatInTimeZone(new Date('2026-12-31T15:30:00Z'), 'Australia/Perth', 'date')).toBe(
      '31 Dec 2026',
    )
  })

  it.each([null, undefined, '', 'not a date'])('returns a dash for %j', (value) => {
    expect(formatInTimeZone(value, 'Australia/Sydney')).toBe(NO_DATE)
  })

  it('throws for an unknown time zone', () => {
    expect(() => formatInTimeZone('2026-01-01T00:00:00Z', 'Mars/Olympus_Mons')).toThrow(RangeError)
  })
})

describe('describeTimeZone', () => {
  const summer = new Date('2026-01-15T00:00:00Z')
  const winter = new Date('2026-07-15T00:00:00Z')

  it.each([
    ['Australia/Perth', summer, 'AWST UTC+8'],
    ['Australia/Perth', winter, 'AWST UTC+8'],
    ['Australia/Sydney', summer, 'AEDT UTC+11'],
    ['Australia/Sydney', winter, 'AEST UTC+10'],
    ['Australia/Adelaide', summer, 'ACDT UTC+10:30'],
    ['Australia/Adelaide', winter, 'ACST UTC+9:30'],
    ['UTC', summer, 'UTC'],
    ['Asia/Kolkata', summer, 'UTC+5:30'],
  ])('%s at %s → %s', (zone, at, expected) => {
    expect(describeTimeZone(zone, at)).toBe(expected)
  })

  it('follows the switch to daylight time in Sydney (4 Oct 2026, 16:00 UTC)', () => {
    expect(describeTimeZone('Australia/Sydney', new Date('2026-10-03T15:59:00Z'))).toBe('AEST UTC+10')
    expect(describeTimeZone('Australia/Sydney', new Date('2026-10-03T16:00:00Z'))).toBe('AEDT UTC+11')
  })
})

