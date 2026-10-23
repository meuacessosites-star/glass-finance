import { localDateKey } from './card-billing';
import { sanitizeDueDate } from './transaction-status';

export type ReserveMovement = { id: string; kind: 'opening' | 'deposit' | 'withdrawal'; amount: number; date: string; note: string };
export type ReserveYield = { enabled: boolean; cdiPercent: number; annualCdi: number | null; months: number; bankPresetId?: string };
export type AppReserve = { id: string; name: string; amount: number; color: string; createdAt: string; target?: number; deadline?: string; icon?: string; note?: string; movements?: ReserveMovement[]; location?: string; yield?: ReserveYield };
export type ReserveDetails = Pick<AppReserve, 'name' | 'color' | 'target' | 'deadline' | 'icon' | 'note' | 'location' | 'yield'>;
const money = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 999999999 ? Math.round(v * 100) / 100 : 0;
const clean = (v: unknown, length: number) => typeof v === 'string' ? v.trim().slice(0, length) : '';

export function sanitizeReserves(value: unknown): AppReserve[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map((r, index) => {
    const id = clean(r.id, 150) || `reserve-import-${index}`;
    const amount = money(r.amount);
    const createdAt = sanitizeDueDate(r.createdAt) || localDateKey(new Date());
    const seen = new Set<string>();
    const movements: ReserveMovement[] = [];
    if (Array.isArray(r.movements)) for (const entry of r.movements) {
      if (!entry || typeof entry !== 'object' || !['opening','deposit','withdrawal'].includes(entry.kind)) continue;
      const entryId = clean(entry.id, 180);
      const date = sanitizeDueDate(entry.date);
      const value = money(entry.amount);
      if (!entryId || seen.has(entryId) || !date || value <= 0) continue;
      seen.add(entryId);
      movements.push({ id: entryId, kind: entry.kind, amount: value, date, note: clean(entry.note, 180) });
    }
    const recorded = movements.reduce((sum, m) => sum + Math.round(m.amount * 100) * (m.kind === 'withdrawal' ? -1 : 1), 0);
    const difference = Math.round(amount * 100) - recorded;
    // Preserve the existing balance when importing older data without a history.
    if (difference) movements.unshift({ id: `${id}-balance-${difference}`, kind: difference > 0 ? 'opening' : 'withdrawal', amount: Math.abs(difference) / 100, date: createdAt, note: 'Saldo anterior ao histórico' });
    return { id, name: clean(r.name, 50) || 'Minha reserva', amount, color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#2F6BFF', createdAt, target: money(r.target) || undefined, deadline: sanitizeDueDate(r.deadline) || undefined, icon: clean(r.icon, 30) || 'shield', note: clean(r.note, 180), location: clean(r.location, 70), yield: sanitizeReserveYield(r.yield), movements };
  });
}

export function recordReserveMovement(reserve: AppReserve, entry: ReserveMovement): AppReserve {
  const normalized = sanitizeReserves([reserve])[0];
  const amount = money(entry.amount);
  if (!amount || !sanitizeDueDate(entry.date) || entry.date > localDateKey(new Date()) || !['deposit', 'withdrawal'].includes(entry.kind) || !entry.id || normalized.movements?.some(m => m.id === entry.id)) return reserve;
  const balance = Math.round(normalized.amount * 100) + Math.round(amount * 100) * (entry.kind === 'withdrawal' ? -1 : 1);
  if (balance < 0 || balance > 99999999900) return reserve;
  return { ...normalized, amount: balance / 100, movements: [...(normalized.movements || []), { ...entry, amount, note: clean(entry.note, 180) }] };
}

export function reserveProgress(reserve: AppReserve) {
  const target = money(reserve.target);
  const remaining = target ? Math.max(0, Math.round(target * 100) - Math.round(reserve.amount * 100)) / 100 : 0;
  return { target, remaining, percent: target ? Math.min(100, Math.round(reserve.amount / target * 100)) : 0, complete: target > 0 && remaining === 0 };
}

export function sanitizeReserveYield(value: unknown): ReserveYield {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const valid = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  return { ...(typeof v.bankPresetId === 'string' && /^[a-z0-9-]{1,60}$/.test(v.bankPresetId) ? { bankPresetId: v.bankPresetId } : {}), enabled: v.enabled === true, cdiPercent: valid(v.cdiPercent, 300) ? Number(v.cdiPercent) : 100, annualCdi: valid(v.annualCdi, 100) ? Number(v.annualCdi) : null, months: typeof v.months === 'number' && [1,3,6,12,24].includes(v.months) ? v.months : 1 };
}
/** Forward-looking gross estimate only. Constant annual reference and 21 business days/month.
 * Daily compounding follows the DI convention, before taxes, fees and bank product rules.
 * No estimate is ever recorded as a deposit or added to the real reserve balance.
 */
export function simulateReserveYield(principal: number, settings: ReserveYield) {
  const normalized = sanitizeReserveYield(settings);
  if (!normalized.enabled || normalized.annualCdi === null || !Number.isFinite(principal) || principal < 0 || principal > 999999999) return null;
  const days = normalized.months * 21;
  const daily = Math.expm1(Math.log1p(normalized.annualCdi / 100) / 252) * normalized.cdiPercent / 100;
  const gain = Math.round(principal * Math.expm1(days * Math.log1p(daily)) * 100) / 100;
  return { gain, total: Math.round((principal + gain) * 100) / 100, days, months: normalized.months };
}
