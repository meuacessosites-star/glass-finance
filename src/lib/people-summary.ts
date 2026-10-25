import type {LoanReceivable} from './app-store';
import {getLoanOutstandingAmount,getLoanReceivedAmount} from './loan-repayments';
export const contactKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function contactLoans(name:string,loans:LoanReceivable[],today:string){
 const rows=loans.filter(r=>contactKey(r.contact)===contactKey(name));
 return {rows,outstanding:rows.reduce((s,r)=>s+getLoanOutstandingAmount(r),0),received:rows.reduce((s,r)=>s+getLoanReceivedAmount(r),0),overdue:rows.filter(r=>r.dueDate&&r.dueDate<today&&getLoanOutstandingAmount(r)>0).length};
}
export function whatsappNumber(phone:string){const digits=phone.replace(/\D/g,'');return digits.length===10||digits.length===11?'55'+digits:digits;}
