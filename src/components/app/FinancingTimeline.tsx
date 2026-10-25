import {useState} from 'react';
import type {AppFinancing} from '@/lib/app-store';
import {financingSummary} from '@/lib/financing-plan';
import {usePrivateCurrency} from './BalancePrivacy';
export function FinancingTimeline({financing:f,today,onAdjust}:{financing:AppFinancing;today:string;onAdjust:(installment:number,amount:number)=>void}){
 const s=financingSummary(f,today),money=usePrivateCurrency();
 const [page,setPage]=useState(()=>Math.floor(Math.min(f.currentInstallment-1,f.installments-1)/12));
 const current=Math.min(page,Math.ceil(s.rows.length/12)-1),rows=s.rows.slice(current*12,current*12+12),last=s.rows[s.rows.length-1];
 return <section className="financing-timeline mt-3" aria-label={`Prazo de ${f.name}`}>
   <div className="planning-row"><div><strong className="text-lg">{s.pending.length?`${s.pending.length} parcelas restantes`:'Financiamento concluído'}</strong><p className="planning-muted">{s.pending.length?`Término previsto: ${last?.date.split('-').reverse().join('/')}`:'Todas as parcelas estão registradas como pagas.'}</p></div>{s.next&&<div className="financing-next-amount"><span>Próxima parcela</span><strong>{money(s.next.amount)}</strong></div>}</div>
   {s.pending.length>0&&<p className="planning-muted">{s.overdue?`${s.overdue} parcela(s) já venceu(ram). Quitar atrasos não acrescenta meses ao prazo original.`:`Equivale a ${s.pending.length} mês(es) de parcelas, mantendo um pagamento por mês.`}</p>}
   <div className="planning-row"><button type="button" className="planning-button" aria-label="12 parcelas anteriores" disabled={current<=0} onClick={()=>setPage(current-1)}>‹</button><span className="text-sm font-semibold">Parcelas {rows[0]?.index}–{rows[rows.length-1]?.index} de {f.installments}</span><button type="button" className="planning-button" aria-label="12 parcelas seguintes" disabled={(current+1)*12>=s.rows.length} onClick={()=>setPage(current+1)}>›</button></div>
   <div className="financing-months">{rows.map(p=><button type="button" key={p.index} disabled={p.paid} onClick={()=>onAdjust(p.index,p.amount)} className={`financing-month ${p.paid?'is-paid':p.date<today?'is-late':p.index===s.next?.index?'is-next':''}`} aria-label={`Parcela ${p.index}, ${p.date.split('-').reverse().join('/')}, ${money(p.amount)}, ${p.paid?'paga':p.date<today?'vencida':'pendente'}${p.paid?'':', ajustar valor'}`}><strong>{p.index}</strong><span className="financing-month-amount">{money(p.amount)}</span><span>{p.date.slice(5,7)}/{p.date.slice(2,4)}</span><small>{p.paid?'✓ Paga':p.date<today?'Vencida':p.index===s.next?.index?'Próxima':'A pagar'}</small></button>)}</div>
   <p className="planning-muted mt-2">Toque em uma parcela pendente para ajustar o valor previsto. {f.variableInstallments?'Valor variável: atualize conforme os boletos do banco. Meses sem ajuste usam a parcela-base; não há cálculo automático de juros ou índices.':'Os meses sem ajuste usam o valor previsto do contrato.'}</p>
 </section>
}
