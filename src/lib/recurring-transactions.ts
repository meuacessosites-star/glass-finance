import type { Transaction } from "./mock-data";

/**
 * Materialize recurrences only through a month requested by the user.
 * The series has no fixed end date: opening later months extends it without
 * creating an unbounded number of database rows in advance.
 * Each occurrence has a deterministic ID, so reloading and switching devices
 * never doubles the same amount.
 */
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function dayToTime(day: string): number | null {
  if (!ISO_DAY.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const time = Date.UTC(year, month - 1, date);
  return new Date(time).toISOString().slice(0, 10) === day ? time : null;
}

function dateAt(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function calendarOccurrence(first: string, index: number, yearly: boolean): string {
  const [year, month, day] = first.split("-").map(Number);
  const candidate = new Date(Date.UTC(year + (yearly ? index : 0), month - 1 + (yearly ? 0 : index), 1));
  const y = candidate.getUTCFullYear();
  const m = candidate.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dateAt(Date.UTC(y, m, Math.min(day, lastDay)));
}

function occurrenceDate(source: Transaction, index: number): string | null {
  const timestamp = dayToTime(source.date);
  if (timestamp === null || index < 1) return null;
  const frequency = source.frequency ?? "mensal";
  if (frequency === "mensal" || frequency === "anual") {
    return calendarOccurrence(source.date, index, frequency === "anual");
  }
  const interval = frequency === "semanal" ? 7 : Math.max(1, Math.min(365, Math.floor(source.frequencyInterval ?? 30)));
  const next = timestamp + index * interval * DAY_MS;
  return Number.isFinite(next) && next < 253402300800000 ? dateAt(next) : null;
}

function offsetMonth(value: string, offset: number): string {
  const [year, month] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Stable ID for an occurrence, independent of current device or browser clock. */
export function recurringOccurrenceId(sourceId: string, date: string): string {
  return `recurrence:${sourceId}:${date}`;
}

/** Generate up to a month, or restrict generation to a requested range.
 * An active series has no end date; a single-month request is bounded work.
 */
export function appendRecurringThrough(
  transactions: Transaction[],
  throughMonth: string,
  fromMonth?: string,
): Transaction[] {
  if (!ISO_MONTH.test(throughMonth)) return transactions;
  const boundedFrom = fromMonth && ISO_MONTH.test(fromMonth) && fromMonth <= throughMonth ? fromMonth : undefined;
  const rangeStart = boundedFrom ? `${boundedFrom}-01` : undefined;
  const end = `${throughMonth}-${String(new Date(Date.UTC(Number(throughMonth.slice(0, 4)), Number(throughMonth.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  const ids = new Set(transactions.map((item) => item.id));
  const created: Transaction[] = [];
  for (const source of transactions) {
    if (source.recurrence !== "recorrente" || source.recurrenceSourceId || source.source === "loan") continue;
    if (dayToTime(source.date) === null || source.date >= end) continue;
    const skipped = new Set(source.recurrenceSkippedDates ?? []);
    // Jump close to the requested date instead of creating all intervening
    // years. Each occurrence still has the same deterministic ID.
    let firstIndex = 1;
    if (rangeStart) {
      const frequency = source.frequency ?? "mensal";
      if (frequency === "mensal" || frequency === "anual") {
        const monthsApart = (Number(boundedFrom!.slice(0, 4)) - Number(source.date.slice(0, 4))) * 12 +
          Number(boundedFrom!.slice(5, 7)) - Number(source.date.slice(5, 7));
        firstIndex = Math.max(1, Math.floor(monthsApart / (frequency === "anual" ? 12 : 1)) - 1);
      } else {
        const daysApart = (dayToTime(rangeStart)! - dayToTime(source.date)!) / DAY_MS;
        const interval = frequency === "semanal" ? 7 : Math.max(1, Math.min(365, Math.floor(source.frequencyInterval ?? 30)));
        firstIndex = Math.max(1, Math.floor(daysApart / interval) - 1);
      }
    }
    // At most 31 occurrences per month even for a daily schedule.
    const maxIterations = rangeStart ? 40 : 10000;
    for (let index = firstIndex; index < firstIndex + maxIterations; index++) {
      const date = occurrenceDate(source, index);
      if (!date || date > end || (source.recurrenceEndDate && date > source.recurrenceEndDate)) break;
      if (rangeStart && date < rangeStart) continue;
      const id = recurringOccurrenceId(source.id, date);
      if (ids.has(id) || skipped.has(date)) continue;
      const oldDateTime = dayToTime(source.date)!;
      const dateTime = dayToTime(date)!;
      const dueTime = source.dueDate ? dayToTime(source.dueDate) : null;
      const invoiceOffset = source.cardInvoiceMonth && ISO_MONTH.test(source.cardInvoiceMonth)
        ? (Number(source.cardInvoiceMonth.slice(0, 4)) - Number(source.date.slice(0, 4))) * 12 +
          Number(source.cardInvoiceMonth.slice(5, 7)) - Number(source.date.slice(5, 7))
        : null;
      created.push({
        ...source,
        id,
        date,
        dueDate: dueTime === null ? undefined : dateAt(dateTime + (dueTime - oldDateTime)),
        cardInvoiceMonth: invoiceOffset === null ? undefined : offsetMonth(date.slice(0, 7), invoiceOffset),
        recurrenceSourceId: source.id,
        recurrenceEndDate: undefined,
        recurrenceSkippedDates: undefined,
        paymentStatus: "pending",
        paymentDate: undefined,
      });
      ids.add(id);
    }
  }
  return created.length ? [...transactions, ...created] : transactions;
}

/** Materialize just the selected month. Opening any later month extends the
 * perpetual series without flooding storage with future transactions. */
export function appendRecurringInMonth(transactions: Transaction[], month: string): Transaction[] {
  return appendRecurringThrough(transactions, month, month);
}

/** Pause all future occurrences of the series without erasing paid history. */
export function stopRecurringEntries(transactions: Transaction[], entryId: string, today: string): Transaction[] {
  if (dayToTime(today) === null) return transactions;
  const selected = transactions.find((row) => row.id === entryId);
  const sourceId = selected?.recurrenceSourceId ?? entryId;
  const source = transactions.find((row) => row.id === sourceId);
  if (!source || source.recurrence !== "recorrente" || source.recurrenceSourceId) return transactions;
  const cutoff = source.recurrenceEndDate && source.recurrenceEndDate < today
    ? source.recurrenceEndDate
    : today;
  let changed = false;
  const result = transactions.flatMap((row) => {
    if (row.recurrenceSourceId === sourceId && row.date > cutoff && row.paymentStatus !== "paid") {
      changed = true;
      return [];
    }
    if (row.id === sourceId && row.recurrenceEndDate !== cutoff) {
      changed = true;
      return [{ ...row, recurrenceEndDate: cutoff }];
    }
    return [row];
  });
  return changed ? result : transactions;
}

/** Stop the series beginning on this day (inclusive), rather than after it.
 * The original entry and every previously recorded payment are preserved.
 */
export function stopRecurringEntriesFrom(transactions: Transaction[], entryId: string, fromDate: string): Transaction[] {
  const fromTime = dayToTime(fromDate);
  if (fromTime === null) return transactions;
  const selected = transactions.find((row) => row.id === entryId);
  const sourceId = selected?.recurrenceSourceId ?? entryId;
  const source = transactions.find((row) => row.id === sourceId);
  const startTime = source ? dayToTime(source.date) : null;
  // The first saved entry belongs to the historical series and must remain.
  if (!source || source.recurrence !== "recorrente" || startTime === null || fromTime <= startTime) {
    return transactions;
  }
  return stopRecurringEntries(transactions, entryId, dateAt(fromTime - DAY_MS));
}
