/** Read-only checks: this never edits or transmits financial records. */
type AuditRow = {
  id: string;
  amount: number;
  date: string;
  title?: string;
  recurrence?: string;
  recurrenceSourceId?: string;
  attachments?: string[];
};
type AuditProfile = {
  id: string;
  data: { transactions: AuditRow[] };
};
export type FinancialAudit = {
  profileCount: number;
  transactionCount: number;
  duplicateIds: number;
  invalidAmounts: number;
  invalidDates: number;
  incompleteRows: number;
  brokenRecurrenceLinks: number;
  issues: number;
};
function validDate(date: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10) === date;
}
export function auditFinancialProfiles(profiles: AuditProfile[]): FinancialAudit {
  const result: FinancialAudit = {
    profileCount: profiles.length,
    transactionCount: 0,
    duplicateIds: 0,
    invalidAmounts: 0,
    invalidDates: 0,
    incompleteRows: 0,
    brokenRecurrenceLinks: 0,
    issues: 0,
  };
  for (const profile of profiles) {
    const rows = profile.data.transactions;
    result.transactionCount += rows.length;
    const ids = new Set<string>();
    const sources = new Set(rows.filter(row => row.recurrence === "recorrente" && !row.recurrenceSourceId).map(row => row.id));
    for (const row of rows) {
      if (typeof row.id !== "string" || row.id.trim() === "" || typeof row.title !== "string" || row.title.trim() === "") {
        result.incompleteRows++;
      }
      if (ids.has(row.id)) result.duplicateIds++;
      ids.add(row.id);
      if (!Number.isFinite(row.amount) || !Number.isSafeInteger(Math.round(row.amount * 100)) ||
          Math.abs(Math.round(row.amount * 100) - row.amount * 100) > 0.000001) result.invalidAmounts++;
      if (!validDate(row.date)) result.invalidDates++;
      if (row.recurrenceSourceId && !sources.has(row.recurrenceSourceId)) result.brokenRecurrenceLinks++;
    }
  }
  result.issues = result.duplicateIds + result.invalidAmounts + result.invalidDates +
    result.incompleteRows + result.brokenRecurrenceLinks;
  return result;
}
