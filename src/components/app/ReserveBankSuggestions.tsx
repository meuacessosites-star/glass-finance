import { Landmark, Check, ExternalLink } from 'lucide-react';
import { BANK_REFERENCE_DATE, findReserveBankPresets, reserveBankPresets, type ReserveBankPreset } from '@/lib/reserve-bank-presets';
import type { ReserveYield } from '@/lib/reserves';

export function ReserveBankSuggestions({ location, settings, onSelect }: { location: string; settings: ReserveYield; onSelect: (preset: ReserveBankPreset) => void }) {
  const selected = reserveBankPresets.find(p => p.id === settings.bankPresetId);
  const matches = selected ? [] : findReserveBankPresets(location);
  return <div className="reserve-bank-suggestions">
    {!selected && <p className="reserve-bank-help">Digite o banco e escolha uma sugestão para preencher o % do CDI. Você pode editar tudo depois.</p>}
    {matches.length > 0 && <div className="reserve-bank-options" aria-label="Sugestões de rendimento por banco">{matches.map(p => <button key={p.id} type="button" onClick={() => onSelect(p)}><Landmark size={18} aria-hidden="true"/><span><strong>{p.bank}</strong><small>{p.product}</small></span><b>{p.upTo ? 'Até ' : ''}{p.percent}%<small>do CDI</small></b></button>)}</div>}
    {!selected && location.trim().length >= 2 && matches.length === 0 && <p className="reserve-bank-help">Sem sugestão para esse nome. Você pode preencher o rendimento manualmente ou usar “Só organizar”.</p>}
    {selected && <div className="reserve-bank-reference" role="status"><strong><Check size={16} aria-hidden="true"/> {settings.cdiPercent === selected.percent ? 'Sugestão preenchida — pode editar' : 'Percentual personalizado'}</strong><p>{selected.bank} · {selected.product}</p><p>{selected.conditions}</p><small>Referência consultada em {BANK_REFERENCE_DATE}. Não é uma consulta à sua conta nem uma atualização automática.</small><a href={selected.source} target="_blank" rel="noopener noreferrer">Consultar condições no banco <ExternalLink size={13}/></a></div>}
  </div>;
}
