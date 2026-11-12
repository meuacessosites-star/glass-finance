/** Determines precisely which months a transaction filter asks to show.
 * Never expands an unbounded 'all history' request into an unlimited series.
 */
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-[0-3]\d$/;
export const MAX_RECURRING_FILTER_MONTHS = 120;

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function indexMonth(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function requestedRecurrenceMonths(
  selectedMonth: string,
  selectedMonths: string[],
  rangeStart: string | null,
  rangeEnd: string | null,
  customRange: boolean,
): { months: string[]; truncated: boolean } {
  if (selectedMonths.length) {
    const all = [...new Set(selectedMonths.filter(month => ISO_MONTH.test(month)))].sort();
    return { months: all.slice(0, MAX_RECURRING_FILTER_MONTHS), truncated: all.length > MAX_RECURRING_FILTER_MONTHS };
  }
  if (customRange && rangeStart && ISO_DAY.test(rangeStart)) {
    const from = rangeStart.slice(0, 7);
    const to = rangeEnd && ISO_DAY.test(rangeEnd) && rangeEnd >= rangeStart ? rangeEnd.slice(0, 7) : from;
    const start = monthIndex(from);
    const end = monthIndex(to);
    if (end < start) return { months: [from], truncated: false };
    const count = end - start + 1;
    return {
      months: Array.from({ length: Math.min(count, MAX_RECURRING_FILTER_MONTHS) }, (_, i) => indexMonth(start + i)),
      truncated: count > MAX_RECURRING_FILTER_MONTHS,
    };
  }
  return { months: ISO_MONTH.test(selectedMonth) ? [selectedMonth] : [], truncated: false };
}
