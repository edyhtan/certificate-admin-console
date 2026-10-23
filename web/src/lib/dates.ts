/**
 * Formats instants for people, always in a given IANA time zone (the tenant's), never the
 * browser's (spec §4). The API sends UTC ISO-8601 instants plus the tenant's `timezone`.
 */

export type DateStyle = 'date' | 'dateTime'

const LOCALE = 'en-AU'

const options: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  // 31 Dec 2026
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  // 31 Dec 2026, 23:30 AWST: the zone name tells the two 02:30s apart when daylight saving ends
  dateTime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  },
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string, style: DateStyle): Intl.DateTimeFormat {
  const key = `${timeZone}|${style}`
  let formatter = formatters.get(key)
  if (!formatter) {
    // Throws a RangeError for an unknown zone, which is a bug worth seeing.
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options[style], timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

/** Placeholder shown for a missing or unreadable instant. */
export const NO_DATE = '—'

/**
 * `instant` in `timeZone`, e.g. `formatInTimeZone('2026-12-31T15:30:00Z', 'Australia/Perth')`
 * → `31 Dec 2026, 23:30 AWST`. Returns `—` for null, undefined or an unparseable value.
 */
export function formatInTimeZone(
  instant: string | Date | null | undefined,
  timeZone: string,
  style: DateStyle = 'dateTime',
): string {
  if (instant == null || instant === '') return NO_DATE
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) return NO_DATE
  return formatterFor(timeZone, style).format(date)
}

/** The calendar date only, e.g. `31 Dec 2026`. */
export function formatDateInTimeZone(
  instant: string | Date | null | undefined,
  timeZone: string,
): string {
  return formatInTimeZone(instant, timeZone, 'date')
}
