import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOME_ALERT_PREFERENCES,
  HOME_ALERT_DURATIONS,
  sanitizeHomeAlertPreferences,
  updateHomeAlertPreferences,
} from "../src/lib/home-alert-preferences";
import {
  createHomeAlertSession,
  getHomeAlerts,
  hideHomeAlert,
  registerHomeAlerts,
  visibleHomeAlerts,
} from "../src/lib/home-alerts";
import {
  loadHomeAlertSession,
  resetHomeAlertSessions,
  resetProfileHomeAlerts,
  saveHomeAlertSession,
} from "../src/lib/home-alert-session";

const alerts = getHomeAlerts(
  {
    cards: [],
    transactions: [],
    loanReceivables: [],
    includeBorrowedCardInvoices: false,
    notifications: [
      {
        id: "n",
        status: "pending",
        merchant: "Mercado",
        bank: "Banco",
        amount: 50,
        date: "2026-10-20",
      },
    ],
  },
  "2026-10-20",
);
test("legacy profiles retain the existing automatic eight-second, three-minute glass defaults", () => {
  assert.deepEqual(
    sanitizeHomeAlertPreferences(undefined),
    DEFAULT_HOME_ALERT_PREFERENCES,
  );
  assert.deepEqual(
    sanitizeHomeAlertPreferences(null),
    DEFAULT_HOME_ALERT_PREFERENCES,
  );
});
test("manual mode, custom interval, short display duration and design survive save/reload", () => {
  const preferences = {
    enabled: true,
    rotation: "manual",
    intervalSeconds: 20,
    displaySeconds: 30,
    hideOnOpen: false,
    appearance: "compact",
  };
  assert.deepEqual(
    sanitizeHomeAlertPreferences(JSON.parse(JSON.stringify(preferences))),
    preferences,
  );
});
test("invalid imported values fall back safely rather than breaking timers or styles", () => {
  assert.deepEqual(
    sanitizeHomeAlertPreferences({
      enabled: "false",
      rotation: "wrong",
      intervalSeconds: -1,
      displaySeconds: Infinity,
      hideOnOpen: "true",
      appearance: "unknown",
    }),
    DEFAULT_HOME_ALERT_PREFERENCES,
  );
});
test("until-marked mode never times out and opening cannot dismiss it", () => {
  const preferences = sanitizeHomeAlertPreferences({
    displaySeconds: 0,
    hideOnOpen: true,
  });
  assert.equal(preferences.hideOnOpen, false);
  const session = registerHomeAlerts(createHomeAlertSession(), alerts, 100);
  assert.deepEqual(
    visibleHomeAlerts(alerts, session, 86400000, preferences.displaySeconds),
    alerts,
  );
  assert.deepEqual(
    visibleHomeAlerts(
      alerts,
      hideHomeAlert(session, alerts[0].id),
      86400000,
      0,
    ),
    [],
  );
});
test("each shorter and longer display duration expires at the correct boundary", () => {
  const session = registerHomeAlerts(createHomeAlertSession(), alerts, 1000);
  for (const seconds of HOME_ALERT_DURATIONS.filter((value) => value > 0)) {
    assert.equal(
      visibleHomeAlerts(alerts, session, 1000 + seconds * 1000 - 1, seconds)
        .length,
      1,
    );
    assert.equal(
      visibleHomeAlerts(alerts, session, 1000 + seconds * 1000, seconds).length,
      0,
    );
  }
});
test("saving appearance and timing modifies only that profile preference object", () => {
  const first = {
    homeAlertPreferences: { ...DEFAULT_HOME_ALERT_PREFERENCES },
    transactions: [{ id: "t", amount: -50 }],
    notifications: [{ id: "n", status: "pending" }],
    pin: "1234",
  };
  const other = {
    ...first,
    homeAlertPreferences: {
      ...DEFAULT_HOME_ALERT_PREFERENCES,
      appearance: "compact" as const,
    },
  };
  const before = structuredClone({ first, other });
  const updated = updateHomeAlertPreferences(first, {
    ...DEFAULT_HOME_ALERT_PREFERENCES,
    appearance: "banner",
    enabled: false,
  });
  assert.equal(updated.homeAlertPreferences.appearance, "banner");
  assert.equal(updated.homeAlertPreferences.enabled, false);
  assert.strictEqual(updated.transactions, first.transactions);
  assert.strictEqual(updated.notifications, first.notifications);
  assert.deepEqual({ first, other }, before);
});
test("reapplying saved settings resets only the selected profile's temporary display session", () => {
  resetHomeAlertSessions();
  const hidden = hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), alerts, 0),
    alerts[0].id,
  );
  saveHomeAlertSession("a", hidden);
  saveHomeAlertSession("b", hidden);
  resetProfileHomeAlerts("a");
  assert.deepEqual(loadHomeAlertSession("a").hiddenIds, []);
  assert.deepEqual(loadHomeAlertSession("b").hiddenIds, [alerts[0].id]);
});
test("all three appearance models and disabling the area are retained", () => {
  for (const appearance of ["glass", "compact", "banner"] as const) {
    const value = sanitizeHomeAlertPreferences({ appearance, enabled: false });
    assert.equal(value.appearance, appearance);
    assert.equal(value.enabled, false);
  }
});
