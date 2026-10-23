/**
 * CSV writing for the certificate export (spec §5.5): RFC 4180 with CRLF line ends, and
 * protection against spreadsheet formula injection.
 */

/** UTF-8 byte order mark, so Excel reads `Nguyễn` correctly. */
export const UTF8_BOM = '﻿';

/**
 * Characters that make a spreadsheet treat a cell as a formula (spec §5.5: `= + - @`), plus tab
 * and carriage return, which OWASP lists too. Such cells get a leading `'`.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula-protected, then quoted if it contains a comma, quote, CR or LF. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One record, ending in CRLF. */
export function csvLine(values: readonly string[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}
