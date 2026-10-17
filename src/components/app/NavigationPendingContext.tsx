import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useReducer, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useAppStore } from "@/lib/app-store";
import { pendingCountReducer, readPendingCount, type PendingCountReport, type PendingCountState, type PendingSection } from "@/lib/navigation-pending-state";

const PendingContext = createContext<{
  reports: PendingCountState;
  report: (report: PendingCountReport) => void;
  clear: (section: PendingSection, ownerId: string) => void;
} | null>(null);

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const [reports, dispatch] = useReducer(pendingCountReducer, {});
  const report = useCallback((value: PendingCountReport) => dispatch({ type: "report", report: value }), []);
  const clear = useCallback((section: PendingSection, ownerId: string) => dispatch({ type: "clear", section, ownerId }), []);
  const value = useMemo(() => ({ reports, report, clear }), [reports, report, clear]);
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

export function useReportNavigationPendingCount(section: PendingSection, count: number) {
  const context = useContext(PendingContext);
  const report = context?.report;
  const clear = context?.clear;
  const ownerId = useId();
  const { pathname } = useLocation();
  const { activeProfile } = useAppStore();
  const profileId = activeProfile?.id ?? "";
  useLayoutEffect(() => {
    report?.({ section, count, ownerId, profileId, pathname });
    return () => clear?.(section, ownerId);
  }, [section, count, ownerId, profileId, pathname, report, clear]);
}

export function useNavigationPendingCount(section: PendingSection, fallback: number): number {
  const context = useContext(PendingContext);
  const { pathname } = useLocation();
  const { activeProfile } = useAppStore();
  return readPendingCount(context?.reports ?? {}, section, activeProfile?.id ?? "", pathname, fallback);
}
