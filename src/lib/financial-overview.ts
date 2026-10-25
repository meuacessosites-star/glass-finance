import type {ProfileData} from './app-store';
import {selectTransactionLedgers} from './transaction-ledgers';
import {getTransactionPaymentStatus} from './transaction-status';
import {isCreditCardExpense} from './card-billing';
import {getInvoiceSummary,getScopedCommittedAmount,getScopedInvoiceMonths,getScopedInvoiceMetrics} from './card-invoice-summary';
import {getInvoiceDates} from './card-billing';
import {getLoanOutstandingAmount} from './loan-repayments';
import {financingSummary,goalPlan} from './financing-plan';
export function financialOverview(data:ProfileData,month:string,today:string){
 const ledgers=selectTransactionLedgers(data.transactions,data.loanReceivables);
 const regular=[...ledgers.regularTransactions,...ledgers.loanTransactions.filter(t=>t.operationType!=='card')].filter(t=>!t.id.startsWith('fin-')&&!isCreditCardExpense(t));
 const period=regular.filter(t=>(t.dueDate??t.date).startsWith(month));
 const sum=(rows:typeof regular)=>rows.reduce((s,t)=>s+Math.round(Math.abs(t.amount)*100),0)/100;
 const incomes=period.filter(t=>t.amount>0),expenses=period.filter(t=>t.amount<0);
 const paid=(t:typeof regular[number])=>getTransactionPaymentStatus(t,data.cards,data.loanReceivables,today)==='paid';
 const invoices=getInvoiceSummary({cards:data.cards,transactions:data.transactions,receivables:data.loanReceivables,month,includeBorrowed:true,today});
 const finance=data.financings.flatMap(f=>financingSummary(f,today).rows);
 const financeMonth=finance.filter(p=>p.date.startsWith(month));
 const add=(rows:typeof finance)=>rows.reduce((s,p)=>s+Math.round(p.amount*100),0)/100;
 const received=sum(incomes.filter(paid)),expected=sum(incomes.filter(t=>!paid(t))),expense=sum(expenses)+invoices.invoiceTotal+add(financeMonth);
 let overdueInvoices=0;
 for(const c of data.cards.filter(c=>!c.archived))for(const m of getScopedInvoiceMonths([c],data.transactions,data.loanReceivables,true)){
  const due=getInvoiceDates(c,m)?.dueDate;if(due&&due<today&&getScopedInvoiceMetrics(c,data.transactions,data.loanReceivables,m,true,today).openAmount>0)overdueInvoices++;
 }
 return {received,expected,expense,result:received+expected-expense,paid:sum(expenses.filter(paid))+invoices.paidAmount+add(financeMonth.filter(p=>p.paid)),pending:sum(expenses.filter(t=>!paid(t)))+invoices.openAmount+add(financeMonth.filter(p=>!p.paid)),
 overdue:regular.filter(t=>t.amount<0&&getTransactionPaymentStatus(t,data.cards,data.loanReceivables,today)==='overdue').length+finance.filter(p=>!p.paid&&p.date<today).length+overdueInvoices,
 invoiceTotal:invoices.invoiceTotal,invoiceOpen:invoices.openAmount,cardCommitted:data.cards.filter(c=>!c.archived).reduce((s,c)=>s+getScopedCommittedAmount(c,data.transactions,data.loanReceivables,true,today),0),
 financingPending:add(finance.filter(p=>!p.paid)),financingMonth:add(financeMonth),loanOutstanding:data.loanReceivables.reduce((s,r)=>s+getLoanOutstandingAmount(r),0),loanOverdue:data.loanReceivables.filter(r=>r.dueDate&&r.dueDate<today&&getLoanOutstandingAmount(r)>0).length,
 reserveTotal:data.reserves.reduce((s,r)=>s+r.amount,0),goalTotal:data.goals.reduce((s,g)=>s+g.savedAmount,0),goalMonthly:data.goals.reduce((s,g)=>s+(goalPlan(g,today).monthly??0),0),goalsOverdue:data.goals.filter(g=>goalPlan(g,today).overdue).length,pendingNotifications:data.notifications.filter(n=>n.status==='pending').length,hasPeriodData:period.length>0||invoices.invoiceTotal>0||financeMonth.length>0};
}
