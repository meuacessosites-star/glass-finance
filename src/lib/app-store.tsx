import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  categories as seedCategories,
  transactions as seedTransactions,
  type Transaction,
} from "./mock-data";

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
  transactions: Transaction[];
  pin: string | null; // 4-digit PIN, null = disabled
};

/** How a profile avatar is shown: an emoji over a background color, or an
 * uploaded photo with a zoom/pan crop (scale 1–4, pan −1..1 normalized to the
 * visible overflow). */
export type ProfileAvatar = {
  kind: "emoji" | "image";
  emoji: string;
  image: string | null; // data URL when kind === "image"
  bg: string; // background color (hex) behind the emoji / while loading
  crop: { scale: number; panX: number; panY: number };
};

export type AppProfile = {
  id: string;
  name: string;
  avatar: ProfileAvatar;
  data: ProfileData;
};

/** When the PIN should be asked: only on profile switch, or also on app open. */
export type PinUsage = "switch" | "open";

type AppStoreState = {
  profiles: AppProfile[];
  activeProfileId: string;
  pinUsage: PinUsage;
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
    transactions: seedTransactions.map((t) => ({ ...t })),
    pin: null,
  };
}

function cloneData(data: ProfileData): ProfileData {
  return {
    categories: data.categories.map((c) => ({ ...c })),
    cards: data.cards.map((c) => ({ ...c })),
    transactions: data.transactions.map((t) => ({ ...t })),
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

export const DEFAULT_AVATAR_BG = "#DFE9FB";

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;

function sanitizeAvatar(v: unknown, fallbackEmoji: string): ProfileAvatar {
  const a = (v ?? {}) as Record<string, unknown>;
  const crop = (a.crop ?? {}) as Record<string, unknown>;
  const image =
    typeof a.image === "string" && a.image.startsWith("data:image")
      ? a.image
      : null;
  return {
    kind: image && a.kind === "image" ? "image" : "emoji",
    emoji: str(a.emoji, fallbackEmoji),
    image,
    bg: str(a.bg, DEFAULT_AVATAR_BG),
    crop: {
      scale: num(crop.scale, 1, 1, 4),
      panX: num(crop.panX, 0, -1, 1),
      panY: num(crop.panY, 0, -1, 1),
    },
  };
}

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

function sanitizeTransactions(v: unknown): Transaction[] {
  if (!Array.isArray(v)) return seedTransactions.map((t) => ({ ...t }));
  const list = v
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => {
      const recurrenceRaw =
        typeof t.recurrence === "string" ? t.recurrence : "";
      const recurrence: Transaction["recurrence"] =
        recurrenceRaw === "recorrente" ||
        recurrenceRaw === "parcelada" ||
        recurrenceRaw === "unica"
          ? recurrenceRaw
          : undefined;
      const frequencyRaw =
        typeof t.frequency === "string" ? t.frequency : "";
      const frequency: Transaction["frequency"] =
        frequencyRaw === "mensal" ||
        frequencyRaw === "semanal" ||
        frequencyRaw === "anual" ||
        frequencyRaw === "dias"
          ? frequencyRaw
          : recurrence === "recorrente"
            ? "mensal"
            : undefined;
      const frequencyInterval: Transaction["frequencyInterval"] =
        frequency === "dias" &&
        typeof t.frequencyInterval === "number" &&
        Number.isFinite(t.frequencyInterval)
          ? Math.min(365, Math.max(1, Math.round(t.frequencyInterval)))
          : undefined;
      const installments =
        recurrence === "parcelada" &&
        typeof t.installments === "number" &&
        Number.isFinite(t.installments)
          ? Math.min(48, Math.max(2, Math.round(t.installments)))
          : undefined;
      const currentInstallment =
        recurrence === "parcelada" &&
        typeof t.currentInstallment === "number" &&
        Number.isFinite(t.currentInstallment)
          ? Math.min(
              typeof t.installments === "number" && t.installments > 0
                ? t.installments
                : 48,
              Math.max(1, Math.round(t.currentInstallment)),
            )
          : undefined;
      return {
      id: str(t.id, uid("t")),
      title: str(t.title, "Transação"),
      categoryId: str(t.categoryId, "outros"),
      amount:
        typeof t.amount === "number" && Number.isFinite(t.amount)
          ? t.amount
          : 0,
      date:
        typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(t.date)
          ? t.date.slice(0, 10)
          : "2026-08-01",
      time:
        typeof t.time === "string" && /^\d{2}:\d{2}/.test(t.time)
          ? t.time.slice(0, 5)
          : undefined,
      note:
        typeof t.note === "string" && t.note.trim()
          ? t.note.trim().slice(0, 300)
          : undefined,
      attachments: Array.isArray(t.attachments)
        ? t.attachments
            .filter(
              (a): a is string =>
                typeof a === "string" &&
                a.startsWith("data:") &&
                a.length < 3_000_000,
            )
            .slice(0, 6)
        : undefined,
      recurrence,
      frequency,
      frequencyInterval,
      installments,
      currentInstallment,
      paymentMethod:
        typeof t.paymentMethod === "string" && t.paymentMethod.trim()
          ? t.paymentMethod.trim().slice(0, 20)
          : undefined,
      cardId:
        typeof t.cardId === "string" && t.cardId.trim()
          ? t.cardId.trim().slice(0, 40)
          : undefined,
      cardMode:
        t.cardMode === "credito" || t.cardMode === "debito"
          ? t.cardMode
          : t.paymentMethod === "credito" || t.paymentMethod === "debito"
            ? t.paymentMethod
            : undefined,
      };
    })
    .filter((t) => t.amount !== 0);
  return list.length > 0 ? list : seedTransactions.map((t) => ({ ...t }));
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
    return [
      {
        id: "profile-1",
        name: "Marina",
        avatar: {
          kind: "emoji",
          emoji: "🌿",
          image: null,
          bg: DEFAULT_AVATAR_BG,
          crop: { scale: 1, panX: 0, panY: 0 },
        },
        data: defaultData(),
      },
    ];
  }

  const legacy = Array.isArray(parsed.categories); // old flat format
  const sharedCategories = sanitizeCategories(legacy ? parsed.categories : undefined);
  const sharedCards = sanitizeCards(legacy ? parsed.cards : undefined);

  return rawProfiles.map((rawProfile) => {
    const p = (rawProfile ?? {}) as Record<string, unknown>;
    const base = {
      id: str(p.id, uid("profile")),
      name: str(p.name, "Perfil"),
      avatar: sanitizeAvatar(
        p.avatar,
        typeof p.emoji === "string" ? p.emoji : "👤",
      ),
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
          transactions: sanitizeTransactions(nested.transactions),
          pin: pin4(nested.pin),
        },
      };
    }

    return {
      ...base,
      data: {
        categories: sharedCategories.map((c) => ({ ...c })),
        cards: sharedCards.map((c) => ({ ...c })),
        transactions: seedTransactions.map((t) => ({ ...t })),
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
    return {
      profiles,
      activeProfileId,
      pinUsage:
        (parsed as Record<string, unknown> | null)?.pinUsage === "switch"
          ? "switch"
          : "open",
    };
  } catch {
    return {
      profiles: [
        {
          id: "profile-1",
          name: "Marina",
          avatar: {
            kind: "emoji",
            emoji: "🌿",
            image: null,
            bg: DEFAULT_AVATAR_BG,
            crop: { scale: 1, panX: 0, panY: 0 },
          },
          data: defaultData(),
        },
      ],
      activeProfileId: "profile-1",
      pinUsage: "open",
    };
  }
}

type AppStoreValue = {
  profiles: AppProfile[];
  activeProfileId: string;
  pinUsage: PinUsage;
  activeProfile: AppProfile | undefined;
  // Active profile's isolated data (convenience getters):
  categories: AppCategory[];
  cards: AppCard[];
  transactions: Transaction[];
  pin: string | null;
  categoryById: Record<string, AppCategory>;
  /** Creates a category on the active profile and returns its id. */
  addCategory: (data: { label: string; color: string; icon: string }) => string;
  updateCategory: (id: string, patch: Partial<AppCategory>) => void;
  deleteCategory: (id: string) => void;
  addCard: (data: { name: string; last4: string; color: string }) => void;
  deleteCard: (id: string) => void;
  addTransaction: (data: {
    title: string;
    categoryId: string;
    amount: number;
    date: string;
    time?: string;
    note?: string;
    attachments?: string[];
    recurrence?: "unica" | "recorrente" | "parcelada";
    frequency?: "mensal" | "semanal" | "anual" | "dias";
    frequencyInterval?: number;
    installments?: number;
    currentInstallment?: number;
    paymentMethod?: string;
    cardId?: string;
    cardMode?: "credito" | "debito";
  }) => void;
  addProfile: (data: { name: string; avatar: ProfileAvatar }) => void;
  updateProfile: (
    id: string,
    patch: Partial<Pick<AppProfile, "name" | "avatar">>,
  ) => void;
  /** Returns false when the profile could not be deleted (it was the last one). */
  deleteProfile: (id: string) => boolean;
  setActiveProfile: (id: string) => void;
  setPinUsage: (usage: PinUsage) => void;
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
      transactions: [] as Transaction[],
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
      pinUsage: state.pinUsage,
      activeProfile: active,
      categories: activeData.categories,
      cards: activeData.cards,
      transactions: activeData.transactions,
      pin: activeData.pin,
      categoryById,
      addCategory: (data) => {
        const id = uid("cat");
        patchActiveData((d) => ({
          ...d,
          categories: [...d.categories, { id, ...data }],
        }));
        return id;
      },
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
      addTransaction: (data) =>
        patchActiveData((d) => ({
          ...d,
          transactions: [{ id: uid("t"), ...data }, ...d.transactions],
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
      updateProfile: (id, patch) =>
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
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
      setPinUsage: (usage) => setState((s) => ({ ...s, pinUsage: usage })),
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
