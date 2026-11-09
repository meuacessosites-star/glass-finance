/** Deterministic, side-effect-free representation of normalized financial writes. */
export type TransactionOperation = {
  type: "upsert" | "delete";
  profileId: string;
  transactionId: string;
  payload?: Record<string, unknown>;
};
type Item = Record<string, unknown> & { id: string };
type Profile = { id: string; data: Record<string, unknown> & { transactions: Item[] } };
type Root = Record<string, unknown> & { profiles: Profile[] };

function parseRoot(raw: string): Root {
  const root: unknown = JSON.parse(raw);
  if (!root || typeof root !== "object" || !("profiles" in root) ||
      !Array.isArray(root.profiles) || root.profiles.length === 0)
    throw new Error("O estado não contém perfis financeiros válidos");
  const ids = new Set<string>();
  for (const profile of root.profiles) {
    if (!profile || typeof profile.id !== "string" || !profile.id ||
        ids.has(profile.id) || !profile.data || !Array.isArray(profile.data.transactions))
      throw new Error("Perfil ou transações inválidas");
    ids.add(profile.id);
  }
  return root as Root;
}

export function metadataWithoutTransactions(raw: string) {
  const state = parseRoot(raw);
  return JSON.stringify({
    ...state,
    profiles: state.profiles.map(profile => ({
      ...profile,
      data: {
        ...profile.data,
        transactions: [],
        transactionOrder: profile.data.transactions.map(item => item.id),
      },
    })),
  });
}
export function inflateTransactionPages(metadata: string, rows: Record<string, Item[]>) {
  const state = parseRoot(metadata);
  return JSON.stringify({
    ...state,
    profiles: state.profiles.map(profile => {
      const saved = rows[profile.id] ?? [];
      const order = profile.data.transactionOrder;
      let restored = saved;
      if (Array.isArray(order)) {
        const byId = new Map(saved.map(item => [item.id, item]));
        if (new Set(order).size !== order.length ||
            byId.size !== saved.length || order.length !== saved.length ||
            order.some(id => typeof id !== "string" || !byId.has(id))) {
          throw new Error("Histórico paginado incompleto ou com identificadores divergentes");
        }
        restored = order.map(id => byId.get(id as string)!);
      }
      // transactionOrder is a transport manifest; it is not a user setting.
      const { transactionOrder: _order, ...data } = profile.data;
      return { ...profile, data: { ...data, transactions: restored } };
    }),
  });
}
function indexRows(state: Root) {
  const results = new Map<string, { profileId: string; transactionId: string; payload: Item; serialized: string }>();
  for (const profile of state.profiles) {
    for (const row of profile.data.transactions) {
      if (!row || typeof row.id !== "string" || !row.id)
        throw new Error("Transação sem identificador");
      const key = JSON.stringify([profile.id, row.id]);
      if (results.has(key)) throw new Error("Transação duplicada no perfil");
      results.set(key, {
        profileId: profile.id, transactionId: row.id,
        payload: row, serialized: JSON.stringify(row),
      });
    }
  }
  return results;
}
/** Compares individual rows, preserving all fields, attachments and timestamps. */
export function transactionChanges(previousRaw: string, nextRaw: string): TransactionOperation[] {
  const before = indexRows(parseRoot(previousRaw));
  const after = indexRows(parseRoot(nextRaw));
  const operations: TransactionOperation[] = [];
  for (const [key, old] of before) {
    if (!after.has(key)) operations.push({
      type: "delete", profileId: old.profileId, transactionId: old.transactionId,
    });
  }
  for (const [key, current] of after) {
    if (before.get(key)?.serialized !== current.serialized)
      operations.push({
        type: "upsert", profileId: current.profileId,
        transactionId: current.transactionId, payload: current.payload,
      });
  }
  return operations;
}
