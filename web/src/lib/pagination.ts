/** Number of pages for `total` rows; 0 when there are no rows. */
export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0
  return Math.ceil(total / pageSize)
}
