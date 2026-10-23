/** Text formatting for the inspector. Pure functions, no I/O. */

/**
 * `2026-12-31 23:30 AWST`: the instant in the given IANA zone, never the machine's zone.
 * The zone label is the short name `en-AU` gives (`AEDT`, `AWST`, `ACDT`, or `UTC`).
 */
export function formatInstant(
  instant: Date | null | undefined,
  timeZone: string,
): string {
  if (!instant) return '—';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

/** Shortens text to `max` characters, ending in `…` when cut. */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  if (max <= 1) return '…'.slice(0, max);
  return chars.slice(0, max - 1).join('') + '…';
}

function width(text: string): number {
  return [...text].length;
}

function pad(text: string, size: number, align: 'left' | 'right'): string {
  const gap = ' '.repeat(Math.max(0, size - width(text)));
  return align === 'right' ? gap + text : text + gap;
}

export interface Column<T> {
  header: string;
  value: (row: T) => string | number;
  align?: 'left' | 'right';
  /** Longest a cell may be before it is cut with `…`. Default 40. */
  max?: number;
}

/** A plain-text table with a header and a separator line. */
export function renderTable<T>(
  columns: Column<T>[],
  rows: readonly T[],
  empty = '(none)',
): string {
  if (rows.length === 0) return empty;
  const cells = rows.map((row) =>
    columns.map((col) => truncate(String(col.value(row)), col.max ?? 40)),
  );
  const widths = columns.map((col, i) =>
    Math.max(width(col.header), ...cells.map((r) => width(r[i]))),
  );
  const line = (values: string[]) =>
    values
      .map((v, i) => pad(v, widths[i], columns[i].align ?? 'left'))
      .join('  ')
      .trimEnd();
  return [
    line(columns.map((c) => c.header)),
    line(widths.map((w) => '-'.repeat(w))),
    ...cells.map(line),
  ].join('\n');
}

/** `label: value` lines with the labels padded to one width. */
export function renderFields(fields: [string, string | number][]): string {
  const size = Math.max(...fields.map(([label]) => width(label)));
  return fields.map(([label, value]) => `${pad(label, size, 'left')}  ${value}`).join('\n');
}

/** `Page 2 of 5 (63 rows)`. */
export function pageLabel(page: number, pageSize: number, total: number): string {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `Page ${page} of ${pages} (${total} ${total === 1 ? 'row' : 'rows'})`;
}
