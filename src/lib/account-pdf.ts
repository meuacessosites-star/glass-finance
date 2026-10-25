import {financingPaymentMethodLabel} from './financing-payment-method';
import {jsPDF} from 'jspdf';
import type {AppProfile} from './app-store';
import {financialOverview} from './financial-overview';
import {financingSummary} from './financing-plan';
import {getLoanOutstandingAmount,getLoanReceivedAmount} from './loan-repayments';
import {getTransactionPaymentStatus} from './transaction-status';
const brl=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(d?:string)=>d?d.slice(0,10).split('-').reverse().join('/'):'Não informada';
// Built-in PDF fonts support Portuguese via WinAnsi. Avoid invisible controls and unsupported pictograms.
const clean=(s:string)=>s.normalize('NFC').replace(/[\r\n\t]+/g,' ').replace(/[–—−]/g,'-').replace(/…/g,'...').replace(/[^\x20-\x7E\xA0-\xFF]/g,'').trim();
export function createAccountPdf(profile:AppProfile,today:string):Uint8Array {
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true}),data=profile.data;
 const margin=17,width=176,bottom=279;let y=25;
 doc.setProperties({title:`GranaScan - ${clean(profile.name)}`,subject:'Relatório financeiro para consulta',creator:'GranaScan'});
 function heading(){doc.setFillColor(35,68,125);doc.rect(0,0,210,13,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('GRANASCAN | RELATÓRIO FINANCEIRO',margin,8);doc.setTextColor(28,39,59);y=23;}
 function next(){doc.addPage();heading();}
 function line(text:string,bold=false,size=10){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(clean(text)||'-',width) as string[];for(const row of lines){if(y>bottom)next();doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.text(row,margin,y);y+=size*.45+1;}y+=1.5;}
 function section(title:string){if(y>bottom-23)next();y+=4;doc.setDrawColor(207,218,234);doc.line(margin,y-3,193,y-3);line(title,true,13);}
 function empty(){line('Nenhum registro.');}
 heading();line(profile.name,true,19);line(`Emitido em ${date(today)}. Perfil aberto no momento da exportação.`);line('Valores completos, mesmo com o modo de privacidade ativado no aplicativo. Guarde este documento em local seguro.');
 const summary=financialOverview(data,today.slice(0,7),today);
 section(`Resumo do mês ${today.slice(5,7)}/${today.slice(0,4)}`);
 line(`Recebido: ${brl(summary.received)} | A receber: ${brl(summary.expected)}`);
 line(`Despesas do mês: ${brl(summary.expense)} | Pago: ${brl(summary.paid)} | Pendente: ${brl(summary.pending)}`);
 line(`Resultado previsto: ${brl(summary.result)}. Inclui receitas ainda pendentes; não representa saldo bancário disponível.`);
 line('O resumo considera o mês dos vencimentos, as faturas e os financiamentos. As listas seguintes incluem todos os registros e não devem ser somadas entre si.');
 section('Transações cadastradas - todos os períodos');
 const transactions=data.transactions.filter(t=>!t.id.startsWith('fin-')).slice().sort((a,b)=>b.date.localeCompare(a.date));
 if(!transactions.length)empty();
 for(const t of transactions){const category=data.categories.find(c=>c.id===t.categoryId)?.label??'Sem categoria';const status=getTransactionPaymentStatus(t,data.cards,data.loanReceivables,today);line(`${date(t.date)} | ${t.title} | ${brl(t.amount)}`,true);line(`${category} | ${status==='paid'?'Efetivada':status==='overdue'?'Vencida':'Pendente'}${t.dueDate?` | Vencimento: ${date(t.dueDate)}`:''}${t.installments?` | Parcelamento: ${t.installments}x`:''}`);if(t.note)line(`Observação: ${t.note}`);}
 section('Cartões cadastrados');if(!data.cards.length)empty();for(const c of data.cards)line(`${c.name} | Final ${c.last4??'----'}${c.archived?' | Arquivado':''}`);
 section('Empréstimos e recebimentos');if(!data.loanReceivables.length)empty();for(const r of data.loanReceivables){line(`${r.contact} | ${r.description||'Empréstimo'} | ${r.operationType==='card'?'Cartão emprestado':'Dinheiro'}`,true);line(`Vence: ${date(r.dueDate)} | Registrado: ${brl(r.amount)} | Recebido: ${brl(getLoanReceivedAmount(r))} | Falta receber: ${brl(getLoanOutstandingAmount(r))}`);}
 section('Reservas');if(!data.reserves.length)empty();for(const r of data.reserves)line(`${r.name} | Separado: ${brl(r.amount)}`);
 section('Metas');if(!data.goals.length)empty();for(const g of data.goals){line(`${g.name} | Guardado: ${brl(g.savedAmount)} | Objetivo: ${brl(g.targetAmount)} | Prazo: ${date(g.deadline)}`);}
 section('Financiamentos e cronogramas');if(!data.financings.length)empty();for(const f of data.financings){const s=financingSummary(f,today);line(`${f.name} | ${f.institution??'Instituição não informada'}`,true,12);line(`${s.paidCount}/${f.installments} parcelas pagas | ${s.pending.length} restantes | ${f.variableInstallments?'Valores variáveis':'Valores previstos fixos'}`);line(`Pago/informado: ${brl(s.paidAmount)} | Parcelas pendentes: ${brl(s.remaining)} | Término: ${date(s.rows[s.rows.length-1]?.date)}`);for(const p of s.rows)line(`Parcela ${p.index} | ${date(p.date)} | ${brl(p.amount)} | ${p.paid?'Paga':p.date<today?'Vencida':'Prevista'}${p.paymentDate?` | Pagamento: ${date(p.paymentDate)}`:''}${p.paid?` | Forma: ${financingPaymentMethodLabel(p.paymentMethod)}`:''}`);}
 section('Sobre este documento');line('Relatório para consulta, sem PINs, fotos, anexos ou conteúdo de notificações. Contatos do serviço conectado não são exportados. Não restaura dados no aplicativo; use o backup JSON para isso. Valores de parcelas futuras são previsões e não uma proposta de quitação do banco.');
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95,108,128);doc.text(`${clean(profile.name)} | ${date(today)}`,margin,290);doc.text(`${i} / ${pages}`,193,290,{align:'right'});}
 return new Uint8Array(doc.output('arraybuffer'));
}
export async function downloadAccountPdf(profile:AppProfile,today:string){
 const bytes=createAccountPdf(profile,today),blob=new Blob([bytes as BlobPart],{type:'application/pdf'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`granascan-relatorio-${today}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
