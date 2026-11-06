import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/lib/app-store';
import { balancePrivacyKey, formatPrivateAmount } from '@/lib/balance-privacy';
import { useCloudPreference } from '@/hooks/useCloudPreference';
const PrivacyContext = createContext({ hidden: false, toggle: () => {} });
export function BalancePrivacyProvider({ children }: { children: ReactNode }) {
  const { activeProfileId } = useAppStore();
  return <ProfilePrivacy key={activeProfileId}>{children}</ProfilePrivacy>;
}
function ProfilePrivacy({ children }: { children: ReactNode }) {
  const value = useStoredBalancePrivacy();
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
export function useStoredBalancePrivacy(scope: 'all' | 'home-summary' | 'reserves-cards' = 'all') {
  const { activeProfileId } = useAppStore();
  const key = balancePrivacyKey(activeProfileId, scope);
  const { value, setValue } = useCloudPreference(`profile:${activeProfileId}:privacy:${scope}`, "false", key);
  const hidden = value === "true";
  const toggle = useCallback(() => setValue(hidden ? "false" : "true"), [hidden, setValue]);
  return useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
}
/** Display-only boundary: a summary can have its own privacy without hiding sibling rows. */
export function AmountVisibility({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ hidden, toggle: () => {} }), [hidden]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
export const useBalancePrivacy = () => useContext(PrivacyContext);
export function usePrivateCurrency() {
  const { hidden } = useBalancePrivacy();
  return useCallback((amount: number, withSign = false) => formatPrivateAmount(amount, hidden, withSign), [hidden]);
}
export function BalancePrivacyToggle({ privacy, summary = false, cardsOnly = false }: { privacy?: { hidden: boolean; toggle: () => void }; summary?: boolean; cardsOnly?: boolean }) {
  const context = useBalancePrivacy();
  const { hidden, toggle } = privacy ?? context;
  const Icon = hidden ? EyeOff : Eye;
  const label = cardsOnly
    ? hidden ? 'Mostrar valores dos cards de Reservas' : 'Ocultar valores dos cards de Reservas'
    : summary ? hidden ? 'Mostrar saldo, receitas e despesas' : 'Ocultar saldo, receitas e despesas'
    : hidden ? 'Mostrar valores' : 'Ocultar valores';
  const help = cardsOnly
    ? 'Oculta apenas o total guardado, os saldos e as simulações dos cards de Reservas. O histórico de entradas e retiradas e os valores das operações continuam visíveis.'
    : summary
      ? 'Oculta somente os valores deste resumo. As movimentações continuam visíveis.'
      : 'Ocultar valores nas telas financeiras deste perfil. O Início tem controle próprio. Campos abertos para edição continuam visíveis.';
  return <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={label} title={help} className="glass glass-soft flex size-11 shrink-0 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90"><Icon className="size-[18px]" aria-hidden="true" /></button>;
}
export function PrivateChart({ children }: { children: ReactNode }) {
  const { hidden } = useBalancePrivacy();
  return hidden ? <div className="flex h-full min-h-24 items-center justify-center gap-2 text-sm text-glass-sub"><EyeOff size={18}/>Gráfico oculto por privacidade</div> : <>{children}</>;
}
