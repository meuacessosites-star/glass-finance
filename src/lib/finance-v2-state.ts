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

/**
 * Builds a complete, recoverable interim account state after one successful
 * transaction batch. The last batch commits the requested metadata and order.
 * Incomplete saves are never mistaken for a fully synchronized local account.
 */
export function applyTransactionBatch(
  previousRaw: string,
  desiredRaw: string,
  operations: TransactionOperation[],
  finalBatch: boolean,
): string {
  if (finalBatch) return desiredRaw;
  const previous = parseRoot(previousRaw);
  const desired = parseRoot(desiredRaw);
  const destination = new Map(desired.profiles.map(profile => [profile.id, profile]));
  const profiles = previous.profiles.map(profile => ({
    ...profile, data: { ...profile.data, transactions: [...profile.data.transactions] },
  }));
  for (const op of operations) {
    let profile = profiles.find(item => item.id === op.profileId);
    if (!profile) {
      const targetProfile = destination.get(op.profileId);
      if (!targetProfile || op.type !== "upsert") continue;
      profile = {
        ...targetProfile,
        data: { ...targetProfile.data, transactions: [] },
      };
      profiles.push(profile);
    }
    const rows = profile.data.transactions;
    const at = rows.findIndex(row => row.id === op.transactionId);
    if (op.type === "delete") {
      if (at !== -1) rows.splice(at, 1);
    } else {
      if (!op.payload || op.payload.id !== op.transactionId)
        throw new Error("Transação de lote inválida");
      const row = op.payload as Item;
      if (at === -1) rows.push(row);
      else rows[at] = row;
    }
  }
  return JSON.stringify({ ...previous, profiles });
}

/** Split by both count and UTF-8 payload size to stay below Convex mutation limits. */
export function splitTransactionBatches(operations: TransactionOperation[]) {
  const batches: TransactionOperation[][] = [];
  let batch: TransactionOperation[] = [];
  let bytes = 2;
  const encoder = new TextEncoder();
  for (const op of operations) {
    const size = encoder.encode(JSON.stringify(op)).byteLength + 1;
    if (size > 800_000) throw new Error("Um anexo de transação está grande demais; transfira-o para arquivos antes de salvar");
    if (batch.length >= 20 || (batch.length && bytes + size > 800_000)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(op);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
