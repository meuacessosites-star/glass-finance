export type PendingSection = "transactions" | "loans";
export type PendingCountReport = { section: PendingSection; ownerId: string; profileId: string; pathname: string; count: number };
export type PendingCountState = Partial<Record<PendingSection, PendingCountReport>>;
export type PendingCountAction = { type: "report"; report: PendingCountReport } | { type: "clear"; section: PendingSection; ownerId: string };

export function pendingCountReducer(state: PendingCountState, action: PendingCountAction): PendingCountState {
  if (action.type === "report") {
    const previous = state[action.report.section];
    if (previous && Object.keys(action.report).every((key) => previous[key as keyof PendingCountReport] === action.report[key as keyof PendingCountReport])) return state;
    return { ...state, [action.report.section]: action.report };
  }
  if (state[action.section]?.ownerId !== action.ownerId) return state;
  const next = { ...state };
  delete next[action.section];
  return next;
}

export function readPendingCount(state: PendingCountState, section: PendingSection, profileId: string, pathname: string, fallback: number): number {
  const report = state[section];
  return report?.profileId === profileId && report.pathname === pathname ? report.count : fallback;
}
