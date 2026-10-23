/**
 * Tenant-local calendar values for an instant (spec §4). Instants are stored in UTC; anything
 * calendar-based (the serial year, the CSV issue date) uses the tenant's IANA zone, converted per
 * instant so daylight saving and half-hour offsets are right.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One cached formatter per zone; `en-CA` gives numeric year-month-day parts. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timeZone: string) {
  if (Number.isNaN(instant.getTime())) throw new RangeError('invalid instant');
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** The calendar year at `instant` in `timeZone`, e.g. 2026 for 23:30 on 31 Dec 2026 in Perth. */
export function localYear(instant: Date, timeZone: string): number {
  return Number(localParts(instant, timeZone).year);
}

/** The calendar date at `instant` in `timeZone`, as `YYYY-MM-DD`. */
export function localDate(instant: Date, timeZone: string): string {
  const { year, month, day } = localParts(instant, timeZone);
  return `${year}-${month}-${day}`;
}
