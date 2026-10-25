import {sanitizeFinancingPaymentMethod,financingPaymentTransactionFields} from './financing-payment-method';
import type { AppFinancing } from './app-store';
import type { Transaction } from './mock-data';
import { sanitizeDueDate } from './transaction-status';
export function financingDate(f: Pick<AppFinancing,'startDate'|'dueDay'>, index: number) {
  const [y,m] = f.startDate.split('-').map(Number);
  const date = new Date(Date.UTC(y,m-2+index,1));
  const day = Math.min(f.dueDay,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function financingSchedule(f: AppFinancing) {
  return Array.from({length:Math.min(480,Math.max(0,Math.trunc(f.installments)))},(_,i)=>{
    const index=i+1; const payment=index<f.currentInstallment?f.payments?.find(p=>p.installment===index):undefined;
    return {index,date:financingDate(f,index),amount:payment?.amount??f.forecasts?.find(p=>p.installment===index)?.amount??f.installmentValue,paid:index<f.currentInstallment,paymentDate:payment?.date,paymentMethod:payment?.paymentMethod};
  });
}
export function financingSummary(f: AppFinancing,today:string) {
  const rows=financingSchedule(f),pending=rows.filter(p=>!p.paid),paid=rows.filter(p=>p.paid);
  const sum=(rs:typeof rows)=>rs.reduce((s,p)=>s+Math.round(p.amount*100),0)/100;
  return {rows,pending,paidCount:paid.length,paidAmount:sum(paid),remaining:sum(pending),contractTotal:sum(rows),next:pending[0],overdue:pending.filter(p=>p.date<today).length,percent:rows.length?Math.round(paid.length/rows.length*100):0};
}
export function recordFinancingPayment(f:AppFinancing,date:string,amount:number,paymentMethod?:string):AppFinancing {
  if(f.currentInstallment>f.installments || !sanitizeDueDate(date) || !Number.isFinite(amount) || amount<=0 || amount>1e9)return f;
  const index=f.currentInstallment;
  return {...f,currentInstallment:index+1,payments:[...(f.payments??[]).filter(p=>p.installment!==index),{installment:index,date,amount:Math.round(amount*100)/100,...(sanitizeFinancingPaymentMethod(paymentMethod)?{paymentMethod:sanitizeFinancingPaymentMethod(paymentMethod)}:{})}]};
}
export function reopenFinancingPayment(f:AppFinancing):AppFinancing {
  if(f.currentInstallment<=1)return f;
  return {...f,currentInstallment:f.currentInstallment-1,payments:(f.payments??[]).filter(p=>p.installment!==f.currentInstallment-1)};
}
export function financingFlowRows(financings:AppFinancing[],today:string):Transaction[] {
  return financings.flatMap(f=>financingSchedule(f).filter(p=>p.paid || p.date<=today.slice(0,7)+'-31').map(p=>({id:`fin-${f.id}-${p.index}`,title:`${f.name} · Parcela ${p.index}/${f.installments}`,categoryId:f.categoryId??'moradia',amount:-p.amount,date:p.date,dueDate:p.date,paymentStatus:p.paid?'paid' as const:'pending' as const,paymentDate:p.paid?p.paymentDate??p.date:undefined,note:'Financiamento: gerencie parcelas na aba Financiamentos.',...financingPaymentTransactionFields(p.paymentMethod)})));
}
export function goalPlan(goal:{targetAmount:number;savedAmount:number;deadline?:string},today:string) {
  const remaining=Math.max(0,Math.round((goal.targetAmount-goal.savedAmount)*100)/100);
  const overdue=!!goal.deadline && goal.deadline<today && remaining>0;
  const [y,m]=today.split('-').map(Number),[dy,dm]=(goal.deadline??today).split('-').map(Number);
  const months=goal.deadline?Math.max(1,(dy-y)*12+dm-m+1):null;
  return {remaining,overdue,months,monthly:months?Math.ceil(remaining/months*100)/100:null,complete:remaining===0};
}

/** Changes only the estimate of an unpaid installment; no bank payment is made. */
export function setFinancingForecast(f:AppFinancing,installment:number,amount:number|null):AppFinancing {
 if(!Number.isInteger(installment)||installment<f.currentInstallment||installment>f.installments||amount!==null&&(!Number.isFinite(amount)||amount<=0||amount>1e9))return f;
 return {...f,forecasts:[...(f.forecasts??[]).filter(p=>p.installment!==installment),...(amount===null?[]:[{installment,amount:Math.round(amount*100)/100}])]};
}
