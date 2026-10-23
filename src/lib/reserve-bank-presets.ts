import type { ReserveYield } from './reserves';

export const BANK_REFERENCE_DATE = '22/10/2026';
export type ReserveBankPreset = { id: string; bank: string; product: string; percent: number; upTo?: boolean; aliases: string[]; conditions: string; source: string };
// Product references, not a live bank connection. Never silently update saved rates.
export const reserveBankPresets: ReserveBankPreset[] = [
  { id: 'nubank-emergency', bank: 'Nubank', product: 'Caixinha Reserva de Emergência', percent: 100, aliases: ['nu'], conditions: 'Referência para o RDB da Reserva de Emergência, com resgate imediato. Caixinhas Turbo e outros produtos podem ter regras diferentes.', source: 'https://blog.nubank.com.br/quanto-rende-100-mil-reais-na-conta-do-nubank-e-na-poupanca/' },
  { id: 'mercado-pago-base', bank: 'Mercado Pago', product: 'Cofrinho — rendimento base', percent: 100, aliases: ['mercadopago', 'mp'], conditions: 'Referência base, a partir de 100% do CDI. Rendimentos promocionais, Meli+ e ofertas específicas dependem de requisitos e limites. Ajuste conforme seu aplicativo.', source: 'https://www.mercadopago.com.br/cofrinhos' },
  { id: 'inter-daily', bank: 'Inter', product: 'Meu Porquinho Dia a dia', percent: 80, aliases: ['banco inter'], conditions: 'Modalidade Dia a dia. O Porquinho por objetivo e o Mais Limite têm condições diferentes. Confira o produto contratado.', source: 'https://ajuda.inter.co/investimentos/o-que-e-o-meu-porquinho' },
  { id: 'inter-objective', bank: 'Inter', product: 'Meu Porquinho por objetivo', percent: 100, upTo: true, aliases: ['banco inter'], conditions: 'Até 100% do CDI: o percentual exato pode variar. Preenchemos o teto de referência; confira no aplicativo do Inter e edite antes de salvar.', source: 'https://ajuda.inter.co/investimentos/o-que-e-o-meu-porquinho' },
  { id: 'picpay-standard', bank: 'PicPay', product: 'Cofrinho padrão', percent: 102, aliases: ['pic pay'], conditions: 'Referência do cofrinho padrão. Ofertas turbinadas dependem de requisitos e podem mudar; confirme o percentual no seu aplicativo.', source: 'https://comunica.picpay.com/webview/121-do-cdi-chave-pix-f7ff73' },
];
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function findReserveBankPresets(query: string) {
  const term = normalize(query);
  if (term.length < 2) return [];
  return reserveBankPresets.filter(p => [p.bank, `${p.bank} ${p.product}`, ...p.aliases].some(v => normalize(v).includes(term)));
}
export function applyReserveBankPreset(settings: ReserveYield, preset: ReserveBankPreset): ReserveYield {
  return { ...settings, enabled: true, cdiPercent: preset.percent, bankPresetId: preset.id };
}
