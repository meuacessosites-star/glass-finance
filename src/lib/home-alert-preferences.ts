export const HOME_ALERT_INTERVALS = [5, 8, 12, 20, 30] as const;
export const HOME_ALERT_DURATIONS = [15, 30, 60, 180, 300, 600, 0] as const;
export type HomeAlertPreferences = {
  enabled: boolean;
  rotation: "auto" | "manual";
  intervalSeconds: number;
  displaySeconds: number;
  hideOnOpen: boolean;
  appearance: "glass" | "compact" | "banner";
};
export const DEFAULT_HOME_ALERT_PREFERENCES: HomeAlertPreferences = {
  enabled: true,
  rotation: "auto",
  intervalSeconds: 8,
  displaySeconds: 180,
  hideOnOpen: true,
  appearance: "glass",
};
export function sanitizeHomeAlertPreferences(
  value: unknown,
): HomeAlertPreferences {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<HomeAlertPreferences>)
      : {};
  const displaySeconds = HOME_ALERT_DURATIONS.some(
    (seconds) => seconds === raw.displaySeconds,
  )
    ? raw.displaySeconds!
    : 180;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    rotation: raw.rotation === "manual" ? "manual" : "auto",
    intervalSeconds: HOME_ALERT_INTERVALS.some(
      (seconds) => seconds === raw.intervalSeconds,
    )
      ? raw.intervalSeconds!
      : 8,
    displaySeconds,
    hideOnOpen:
      displaySeconds === 0
        ? false
        : typeof raw.hideOnOpen === "boolean"
          ? raw.hideOnOpen
          : true,
    appearance:
      raw.appearance === "compact" || raw.appearance === "banner"
        ? raw.appearance
        : "glass",
  };
}
export function updateHomeAlertPreferences<
  T extends { homeAlertPreferences?: HomeAlertPreferences },
>(data: T, value: unknown): T {
  return { ...data, homeAlertPreferences: sanitizeHomeAlertPreferences(value) };
}
export function homeAlertDurationLabel(seconds: number): string {
  return seconds === 0
    ? "Até marcar ou concluir"
    : seconds < 60
      ? `${seconds} s`
      : `${seconds / 60} min`;
}
