import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { categories as seedCategories } from "./mock-data";

// ---------------------------------------------------------------------------
// GranaScan client store — personalization data (categories, cards, profiles,
// PIN) persisted to localStorage. The finance numbers themselves remain mock
// data; this store powers the sidebar management screens.
//
// Isolation: every profile owns its own `data` (categories, cards and PIN).
// Switching profiles swaps the active data — nothing saved in one profile is
// ever shared with another.
// ---------------------------------------------------------------------------

export type AppCategory = {
  id: string;
  label: string;
  color: string;
  icon: string; // icon id (see categoryIconOptions in CategoryIcon.tsx)
};

export type AppCard = {
  id: string;
  name: string;
  last4: string;
  color: string;
};

/** Data that belongs to a single profile — never shared between profiles. */
export type ProfileData = {
  categories: AppCategory[];
  cards: AppCard[];
  pin: string | null; // 4-digit PIN, null = disabled
};

export type AppProfile = {
  id: string;
  name: string;
  emoji: string;
  data: ProfileData;
};

type AppStoreState = {
  profiles: AppProfile[];
  activeProfileId: string;
};

const STORAGE_KEY = "granascan.app.v1";

const DEFAULT_CARDS: AppCard[] = [
  { id: "card-1", name: "Nubank", last4: "4821", color: "#AF52DE" },
  { id: "card-2", name: "Inter", last4: "9173", color: "#2F6BFF" },
];

function defaultData(): ProfileData {
  return {
    categories: seedCategories.map((c) => ({ ...c })),
    cards: DEFAULT_CARDS.map((c) => ({ ...c })),
    pin: null,
  };
}

function cloneData(data: ProfileData): ProfileData {
  return {
    categories: data.categories.map((c) => ({ ...c })),
    cards: data.cards.map((c) => ({ ...c })),
    pin: data.pin,
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.trim() ? v : fallback;

const pin4 = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}$/.test(v) ? v : null;

function sanitizeCategories(v: unknown): AppCategory[] {
  if (!Array.isArray(v)) return defaultData().categories;
  const list = v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: str(c.id, uid("cat")),
      label: str(c.label, "Categoria"),
      color: str(c.color, "#8E8E93"),
      icon: str(c.icon, "outros"),
    }));
  return list.length > 0 ? list : defaultData().categories;
}

function sanitizeCards(v: unknown): AppCard[] {
  if (!Array.isArray(v)) return defaultData().cards;
  const list = v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: str(c.id, uid("card")),
      name: str(c.name, "Cartão"),
      last4: /^\d{4}$/.test(String(c.last4 ?? "")) ? String(c.last4) : "0000",
      color: str(c.color, "#2F6BFF"),
    }));
  return list;
}

/**
 * Builds the profile list from persisted data, migrating the legacy flat shape
 * (top-level categories/cards/pin shared by all profiles) into per-profile
 * `data`. Fresh installs get the default Marina profile with clean defaults.
 */
function buildProfiles(raw: unknown): AppProfile[] {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  const rawProfiles: unknown[] = Array.isArray(parsed.profiles)
    ? parsed.profiles
    : [];

  if (rawProfiles.length === 0) {
    return [{ id: "profile-1", name: "Marina", emoji: "🌿", data: defaultData() }];
  }

  const legacy = Array.isArray(parsed.categories); // old flat format
  const sharedCategories = sanitizeCategories(legacy ? parsed.categories : undefined);
  const sharedCards = sanitizeCards(legacy ? parsed.cards : undefined);

  return rawProfiles.map((rawProfile) => {
    const p = (rawProfile ?? {}) as Record<string, unknown>;
    const base = {
      id: str(p.id, uid("profile")),
      name: str(p.name, "Perfil"),
      emoji: str(p.emoji, "👤"),
    };
    const nested =
      p.data && typeof p.data === "object"
        ? (p.data as Record<string, unknown>)
        : null;

    if (nested) {
      return {
        ...base,
        data: {
          categories: sanitizeCategories(nested.categories),
          cards: sanitizeCards(nested.cards),
          pin: pin4(nested.pin),
        },
      };
    }

    return {
      ...base,
      data: {
        categories: sharedCategories.map((c) => ({ ...c })),
        cards: sharedCards.map((c) => ({ ...c })),
        pin:
          legacy && base.id === parsed.activeProfileId
            ? pin4(parsed.pin)
            : null,
      },
    };
  });
}

function loadState(): AppStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const profiles = buildProfiles(parsed);
    const activeProfileId =
      typeof (parsed as Record<string, unknown>)?.activeProfileId === "string" &&
      profiles.some((p) => p.id === (parsed as Record<string, unknown>).activeProfileId)
        ? ((parsed as Record<string, unknown>).activeProfileId as string)
        : profiles[0].id;
    return { profiles, activeProfileId };
  } catch {
    return {
      profiles: [
        { id: "profile-1", name: "Marina", emoji: "🌿", data: defaultData() },
      ],
      activeProfileId: "profile-1",
    };
  }
}

type AppStoreValue = {
  profiles: AppProfile[];
  activeProfileId: string;
  activeProfile: AppProfile | undefined;
  // Active profile's isolated data (convenience getters):
  categories: AppCategory[];
  cards: AppCard[];
  pin: string | null;
  categoryById: Record<string, AppCategory>;
  addCategory: (data: { label: string; color: string; icon: string }) => void;
  updateCategory: (id: string, patch: Partial<AppCategory>) => void;
  deleteCategory: (id: string) => void;
  addCard: (data: { name: string; last4: string; color: string }) => void;
  deleteCard: (id: string) => void;
  addProfile: (data: { name: string; emoji: string }) => void;
  /** Returns false when the profile could not be deleted (it was the last one). */
  deleteProfile: (id: string) => boolean;
  setActiveProfile: (id: string) => void;
  setPin: (pin: string) => void;
  removePin: () => void;
  verifyPin: (pin: string) => boolean;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStoreState>(loadState);

  // Persist on every change (try/catch so blocked localStorage never crashes).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable — keep in-memory state only
    }
  }, [state]);

  const value = useMemo<AppStoreValue>(() => {
    const active =
      state.profiles.find((p) => p.id === state.activeProfileId) ??
      state.profiles[0];
    const activeData = active?.data ?? {
      categories: [] as AppCategory[],
      cards: [] as AppCard[],
      pin: null,
    };

    const categoryById: Record<string, AppCategory> = {};
    for (const c of activeData.categories) categoryById[c.id] = c;

    // Mutations only ever touch the ACTIVE profile's data.
    const patchActiveData = (fn: (d: ProfileData) => ProfileData) =>
      setState((s) => ({
        ...s,
        profiles: s.profiles.map((p) =>
          p.id === s.activeProfileId ? { ...p, data: fn(p.data) } : p,
        ),
      }));

    return {
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
      activeProfile: active,
      categories: activeData.categories,
      cards: activeData.cards,
      pin: activeData.pin,
      categoryById,
      addCategory: (data) =>
        patchActiveData((d) => ({
          ...d,
          categories: [...d.categories, { id: uid("cat"), ...data }],
        })),
      updateCategory: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          categories: d.categories.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),
      deleteCategory: (id) =>
        patchActiveData((d) => ({
          ...d,
          categories: d.categories.filter((c) => c.id !== id),
        })),
      addCard: (data) =>
        patchActiveData((d) => ({
          ...d,
          cards: [...d.cards, { id: uid("card"), ...data }],
        })),
      deleteCard: (id) =>
        patchActiveData((d) => ({
          ...d,
          cards: d.cards.filter((c) => c.id !== id),
        })),
      addProfile: (data) =>
        setState((s) => {
          const profile: AppProfile = {
            id: uid("profile"),
            ...data,
            data: defaultData(),
          };
          return {
            ...s,
            profiles: [...s.profiles, profile],
            activeProfileId: profile.id,
          };
        }),
      deleteProfile: (id) => {
        if (state.profiles.length <= 1) return false;
        setState((s) => {
          const next = s.profiles.filter((p) => p.id !== id);
          return {
            ...s,
            profiles: next,
            activeProfileId:
              s.activeProfileId === id
                ? (next[0]?.id ?? s.activeProfileId)
                : s.activeProfileId,
          };
        });
        return true;
      },
      setActiveProfile: (id) =>
        setState((s) =>
          s.profiles.some((p) => p.id === id)
            ? { ...s, activeProfileId: id }
            : s,
        ),
      setPin: (pin) => patchActiveData((d) => ({ ...d, pin })),
      removePin: () => patchActiveData((d) => ({ ...d, pin: null })),
      verifyPin: (pin) => activeData.pin !== null && activeData.pin === pin,
    };
  }, [state]);

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
