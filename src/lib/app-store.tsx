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
// PIN) persisted to localStorage. The app still uses mock data for the finance
// numbers themselves; this store only powers the sidebar management screens.
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

export type AppProfile = {
  id: string;
  name: string;
  emoji: string;
};

type AppStoreState = {
  categories: AppCategory[];
  cards: AppCard[];
  profiles: AppProfile[];
  activeProfileId: string;
  pin: string | null; // 4-digit PIN, null = disabled
};

const STORAGE_KEY = "granascan.app.v1";

const DEFAULT_CARDS: AppCard[] = [
  { id: "card-1", name: "Nubank", last4: "4821", color: "#AF52DE" },
  { id: "card-2", name: "Inter", last4: "9173", color: "#2F6BFF" },
];

const DEFAULT_PROFILES: AppProfile[] = [
  { id: "profile-1", name: "Marina", emoji: "🌿" },
];

function fallbackState(): AppStoreState {
  return {
    categories: seedCategories.map((c) => ({ ...c })),
    cards: DEFAULT_CARDS.map((c) => ({ ...c })),
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    activeProfileId: "profile-1",
    pin: null,
  };
}

function loadState(): AppStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackState();
    const parsed = JSON.parse(raw) as Partial<AppStoreState>;
    const base = fallbackState();
    return {
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : base.categories,
      cards: Array.isArray(parsed.cards) ? parsed.cards : base.cards,
      profiles:
        Array.isArray(parsed.profiles) && parsed.profiles.length > 0
          ? parsed.profiles
          : base.profiles,
      activeProfileId:
        typeof parsed.activeProfileId === "string" &&
        parsed.profiles?.some((p) => p.id === parsed.activeProfileId)
          ? parsed.activeProfileId
          : base.activeProfileId,
      pin:
        typeof parsed.pin === "string" && /^\d{4}$/.test(parsed.pin)
          ? parsed.pin
          : null,
    };
  } catch {
    return fallbackState();
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

type AppStoreValue = AppStoreState & {
  activeProfile: AppProfile | undefined;
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

  // Persist on every change (try/catch so a blocked localStorage never crashes).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable — keep in-memory state only
    }
  }, [state]);

  const value = useMemo<AppStoreValue>(() => {
    const categoryById: Record<string, AppCategory> = {};
    for (const c of state.categories) categoryById[c.id] = c;

    return {
      ...state,
      categoryById,
      activeProfile:
        state.profiles.find((p) => p.id === state.activeProfileId) ??
        state.profiles[0],
      addCategory: (data) =>
        setState((s) => ({
          ...s,
          categories: [...s.categories, { id: uid("cat"), ...data }],
        })),
      updateCategory: (id, patch) =>
        setState((s) => ({
          ...s,
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),
      deleteCategory: (id) =>
        setState((s) => ({
          ...s,
          categories: s.categories.filter((c) => c.id !== id),
        })),
      addCard: (data) =>
        setState((s) => ({
          ...s,
          cards: [...s.cards, { id: uid("card"), ...data }],
        })),
      deleteCard: (id) =>
        setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) })),
      addProfile: (data) =>
        setState((s) => {
          const profile = { id: uid("profile"), ...data };
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
      setPin: (pin) => setState((s) => ({ ...s, pin })),
      removePin: () => setState((s) => ({ ...s, pin: null })),
      verifyPin: (pin) => state.pin !== null && state.pin === pin,
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
