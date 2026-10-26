import test from 'node:test';
import assert from 'node:assert/strict';
import {financingDate,financingSchedule,financingSummary,financingFlowRows,recordFinancingPayment,reopenFinancingPayment,goalPlan} from '../src/lib/financing-plan';
import {financialOverview} from '../src/lib/financial-overview';
import {inspectBackup} from '../src/lib/backup-validation';
import {contactLoans,whatsappNumber} from '../src/lib/people-summary';
import type {AppFinancing,ProfileData,LoanReceivable} from '../src/lib/app-store';
import type {Transaction} from '../src/lib/mock-data';
const f:AppFinancing={id:'f',name:'Carro',totalAmount:250,installments:3,currentInstallment:1,installmentValue:100,dueDay:31,startDate:'2026-01-31',color:'#336699',createdAt:'2026-01-01'};
const profile=(patch:Partial<ProfileData>={}):ProfileData=>({cards:[],transactions:[],loanReceivables:[],categories:[],people:[],reserves:[],reservesInBalance:false,notifications:[],financings:[],financingsInFlow:false,showCategoryNameOnCard:true,goals:[],pin:null,...patch});
const transaction=(id:string,amount:number,patch:Partial<Transaction>={}):Transaction=>({id,title:id,amount,date:'2026-10-01',categoryId:'moradia',paymentStatus:'paid',...patch});
const loan:LoanReceivable={id:'l',loanId:'l',contact:'Ana Paula',amount:100,status:'scheduled',dueDate:'2026-10-10',operationType:'loan'};
test('financing dates clamp February and recover original due day in March',()=>{
 assert.deepEqual(financingSchedule(f).map(p=>p.date),['2026-01-31','2026-02-28','2026-03-31']);
 assert.equal(financingDate({...f,startDate:'2024-01-31'},2),'2024-02-29');
});
test('next unpaid installment 1 means zero paid, and N+1 persists a completed schedule',()=>{
 assert.equal(financingSummary(f,'2026-02-01').paidCount,0);assert.equal(financingSummary(f,'2026-02-01').overdue,1);
 const done=JSON.parse(JSON.stringify({...f,currentInstallment:4}));const s=financingSummary(done,'2026-04-01');assert.equal(s.percent,100);assert.equal(s.remaining,0);assert.equal(s.next,undefined);
});
test('actual payment amount and date are retained without changing future forecasts',()=>{
 const paid=recordFinancingPayment(f,'2026-02-02',101.25);const s=financingSummary(paid,'2026-02-02');
 assert.equal(s.paidAmount,101.25);assert.equal(s.remaining,200);assert.equal(s.rows[0].paymentDate,'2026-02-02');assert.equal(f.currentInstallment,1);
 assert.deepEqual(reopenFinancingPayment(paid),{...f,payments:[]});
});
test('invalid payment inputs and a completed financing cannot be paid again',()=>{
 for(const n of [0,-1,NaN,Infinity,1e10])assert.equal(recordFinancingPayment(f,'2026-01-31',n),f);
 assert.equal(recordFinancingPayment(f,'2026-02-30',100),f);
 const done={...f,currentInstallment:4};assert.equal(recordFinancingPayment(done,'2026-03-31',100),done);
 assert.equal(reopenFinancingPayment(f),f);
});
test('integrated flow includes current pending and earlier paid, not all future charges',()=>{
 const paid=recordFinancingPayment(f,'2026-01-31',100);const rows=financingFlowRows([paid],'2026-02-02');assert.equal(rows.length,2);assert.equal(rows[0].paymentStatus,'paid');assert.equal(rows[1].paymentStatus,'pending');assert.equal(rows[1].date,'2026-02-28');
});
test('goal current month deadline remains actionable; past day becomes overdue',()=>{
 const g={targetAmount:100,savedAmount:20,deadline:'2026-10-31'};assert.equal(goalPlan(g,'2026-10-23').monthly,80);assert.equal(goalPlan(g,'2026-10-23').overdue,false);assert.equal(goalPlan({...g,deadline:'2026-10-22'},'2026-10-23').overdue,true);
 assert.equal(goalPlan({...g,savedAmount:110},'2026-11-01').complete,true);assert.equal(goalPlan({...g,deadline:undefined},'2026-10-23').monthly,null);
});
test('analysis empty month does not invent money or health score',()=>{
 const a=financialOverview(profile(),'2026-10','2026-10-23');assert.equal(a.result,0);assert.equal(a.hasPeriodData,false);assert.equal(a.pending,0);
});
test('analysis separates received and expected income and paid and pending expenses',()=>{
 const a=financialOverview(profile({transactions:[transaction('in',1000),transaction('expected',200,{paymentStatus:'pending'}),transaction('paid',-50),transaction('unpaid',-100,{paymentStatus:'pending'})]}),'2026-10','2026-10-23');
 assert.equal(a.received,1000);assert.equal(a.expected,200);assert.equal(a.expense,150);assert.equal(a.paid,50);assert.equal(a.pending,100);assert.equal(a.result,1050);
});
test('analysis counts financing once even when integrated transactions are present',()=>{
 const finance={...f,startDate:'2026-10-31'};const p=profile({financings:[finance],transactions:financingFlowRows([finance],'2026-10-23')});const a=financialOverview(p,'2026-10','2026-10-23');assert.equal(a.expense,100);assert.equal(a.pending,100);assert.equal(a.financingPending,300);
 assert.deepEqual(a,financialOverview({...p,transactions:[]},'2026-10','2026-10-23'));
});
test('credit purchases use monthly installment only, never full purchase twice',()=>{
 const card={id:'c',name:'Banco',color:'#333333',last4:'1234',closingDay:10,dueDay:17};const purchase=transaction('purchase',-300,{date:'2026-09-01',cardInvoiceMonth:'2026-09',paymentMethod:'cartao',cardMode:'credito',cardId:'c',recurrence:'parcelada',installments:3,paymentStatus:'pending'});
 const a=financialOverview(profile({cards:[card],transactions:[purchase]}),'2026-10','2026-10-23');assert.equal(a.expense,100);assert.equal(a.invoiceOpen,100);assert.equal(a.pending,100);
});
test('cash loans affect recorded cash flows while outstanding receivables stay separate',()=>{
 const a=financialOverview(profile({transactions:[transaction('advance',-100,{source:'loan',operationType:'loan'}),transaction('receipt',20,{source:'loan',operationType:'loan'})],loanReceivables:[{...loan,receipts:[{id:'r',amount:20,date:'2026-10-02',transactionId:'receipt'}]}]}),'2026-10','2026-10-23');assert.equal(a.received,20);assert.equal(a.expense,100);assert.equal(a.loanOutstanding,80);assert.equal(a.result,-80);
});
test('reserves and goals never inflate cash flow or count as extra income',()=>{
 const a=financialOverview(profile({reserves:[{id:'r',name:'Reserva',amount:500,color:'#333333',createdAt:'2026-10-01'}],goals:[{id:'g',name:'Meta',targetAmount:1000,savedAmount:500,deadline:'2026-11-30',color:'#333333',createdAt:'2026-10-01'}]}),'2026-10','2026-10-23');assert.equal(a.result,0);assert.equal(a.reserveTotal,500);assert.equal(a.goalTotal,500);assert.equal(a.goalMonthly,250);
});
test('people normalize whitespace and case without merging different full names',()=>{
 const info=contactLoans(' ana   PAULA ',[loan,{...loan,id:'b',contact:'Ana Maria'}],'2026-10-23');assert.equal(info.rows.length,1);assert.equal(info.outstanding,100);assert.equal(info.overdue,1);assert.equal(info.received,0);
});
test('Brazilian phone receives country prefix without duplicating existing prefix',()=>{
 assert.equal(whatsappNumber('(11) 99999-9999'),'5511999999999');assert.equal(whatsappNumber('+55 11 99999-9999'),'5511999999999');assert.equal(whatsappNumber(''),'');
});
test('backup validation rejects unrelated JSON and duplicates before replacing anything',()=>{
 for(const value of [{},{profiles:[]},{profiles:[{id:'x',name:'X',data:{}}]},{profiles:[{id:'x',name:'X',data:profile()},{id:'x',name:'Y',data:profile()}]}])assert.throws(()=>inspectBackup(JSON.stringify(value)));
 const summary=inspectBackup(JSON.stringify({profiles:[{id:'x',name:'X',data:profile({transactions:[transaction('1',10)]})}]}));assert.deepEqual(summary,{profiles:1,transactions:1,names:'X'});
});

test('variable installment forecast changes only its month and flows into the global analysis',async()=>{
 const {setFinancingForecast}=await import('../src/lib/financing-plan');
 const base={...f,startDate:'2026-10-31',variableInstallments:true};
 const updated=setFinancingForecast(base,2,135.78);
 assert.deepEqual(financingSchedule(updated).map(p=>p.amount),[100,135.78,100]);
 assert.equal(financingSummary(updated,'2026-10-24').remaining,335.78);
 assert.equal(financialOverview(profile({financings:[updated]}),'2026-11','2026-10-24').financingMonth,135.78);
 assert.equal(financingFlowRows([updated],'2026-11-01')[1].amount,-135.78);
});
test('actual paid amount wins over forecast, reopening restores the forecast',async()=>{
 const {setFinancingForecast}=await import('../src/lib/financing-plan');
 const estimated=setFinancingForecast(f,1,115);
 const paid=recordFinancingPayment(estimated,'2026-01-31',113.55);
 assert.equal(financingSchedule(paid)[0].amount,113.55);
 assert.equal(setFinancingForecast(paid,1,90),paid);
 assert.equal(financingSchedule(reopenFinancingPayment(paid))[0].amount,115);
});
test('forecast validation rejects invalid values and can return one installment to base',async()=>{
 const {setFinancingForecast}=await import('../src/lib/financing-plan');
 for(const amount of [NaN,Infinity,0,-1,1e10])assert.equal(setFinancingForecast(f,1,amount),f);
 for(const index of [0,4,1.5])assert.equal(setFinancingForecast(f,index,10),f);
 const changed=setFinancingForecast(setFinancingForecast(f,1,50),2,80);
 assert.deepEqual(financingSchedule(setFinancingForecast(changed,1,null)).map(p=>p.amount),[100,80,100]);
});
test('home financing with 360 months reports remaining installments and final date',()=>{
 const s=financingSummary({...f,installments:360,currentInstallment:61,startDate:'2020-01-31'},'2025-01-15');
 assert.equal(s.pending.length,300);assert.equal(s.paidCount,60);assert.equal(s.rows[359].date,'2049-12-31');
});
test('avatar initials choose legible white or black across light and dark colors',async()=>{
 const {avatarInk}=await import('../src/lib/person-avatar');
 assert.equal(avatarInk('#FFFFFF'),'#000000');assert.equal(avatarInk('#FFFF00'),'#000000');assert.equal(avatarInk('#000000'),'#FFFFFF');assert.equal(avatarInk('#000080'),'#FFFFFF');
});

test('financing money entry formats thousands and cents and can be cleared',async()=>{
 const {maskMoneyField,parseMoneyField,moneyFieldValue}=await import('../src/lib/financing-form');
 assert.equal(maskMoneyField('64664646'),'646.646,46');
 assert.equal(maskMoneyField('R$ 1.234,56'),'1.234,56');
 assert.equal(maskMoneyField('1'),'0,01');
 assert.equal(maskMoneyField(''),'');
 assert.ok(Number.isNaN(parseMoneyField('')));
 assert.equal(parseMoneyField(maskMoneyField('64664646')),646646.46);
 for(const n of [0,0.01,1000,1234.56,1e9])assert.equal(parseMoneyField(moneyFieldValue(n)),n);
});
test('explicit paid count leaves all 420 installments pending when zero are informed, regardless of date',async()=>{
 const {installmentCounts}=await import('../src/lib/financing-form');
 const counts=installmentCounts('420','0')!;
 const s=financingSummary({...f,...counts},'2026-10-24');
 assert.equal(s.paidCount,0);assert.equal(s.pending.length,420);assert.ok(s.overdue>0);
 assert.equal(installmentCounts('420','419')?.pendingCount,1);
 assert.equal(installmentCounts('420','420')?.currentInstallment,421);
 for(const [total,paid] of [['','0'],['0','0'],['481','0'],['420',''],['420','421'],['12','1.5'],['12','-1']])assert.equal(installmentCounts(total,paid),null);
});
test('correcting paid count cannot resurrect reversed payment amounts or dates',async()=>{
 const {reconcileFinancingHistory}=await import('../src/lib/financing-form');
 const paid=recordFinancingPayment(recordFinancingPayment(f,'2026-01-31',102),'2026-02-28',105);
 assert.deepEqual(reconcileFinancingHistory(paid,3,2).payments,paid.payments);
 const reset={...paid,currentInstallment:1,...reconcileFinancingHistory(paid,3,0)};
 assert.equal(financingSummary(reset,'2026-03-01').paidAmount,0);
 assert.equal(financingSchedule({...reset,currentInstallment:2})[0].amount,100);
 assert.equal(financingSchedule({...reset,currentInstallment:2})[0].paymentDate,undefined);
 assert.equal(paid.payments?.length,2);
});

test('financing payment method is optional and remains attached only to its paid installment',()=>{
 const first=recordFinancingPayment(f,'2026-01-31',100,'pix');
 const second=recordFinancingPayment(first,'2026-02-28',105,'boleto');
 const rows=financingSchedule(JSON.parse(JSON.stringify(second)));
 assert.equal(rows[0].paymentMethod,'pix');assert.equal(rows[1].paymentMethod,'boleto');assert.equal(rows[2].paymentMethod,undefined);
 assert.equal(financingSchedule(reopenFinancingPayment(second))[1].paymentMethod,undefined);
 assert.equal(financingSchedule(recordFinancingPayment(f,'2026-01-31',100))[0].paymentMethod,undefined);
 assert.equal(financingSchedule(recordFinancingPayment(f,'2026-01-31',100,'unknown'))[0].paymentMethod,undefined);
});
test('integrated financing retains payment method without creating a duplicate credit-card charge',async()=>{
 const {isCreditCardExpense}=await import('../src/lib/card-billing');
 const credit=financingFlowRows([recordFinancingPayment(f,'2026-01-31',100,'credito')],'2026-01-31')[0];
 assert.equal(credit.paymentMethod,'cartao');assert.equal(credit.cardMode,'credito');assert.equal(credit.cardId,undefined);assert.equal(isCreditCardExpense(credit),false);
 const pix=financingFlowRows([recordFinancingPayment(f,'2026-01-31',100,'pix')],'2026-01-31')[0];assert.equal(pix.paymentMethod,'pix');
 const unknown=financingFlowRows([f],'2026-01-31')[0];assert.equal(unknown.paymentMethod,undefined);
});
test('every offered financing method has a label and malformed imported values are ignored',async()=>{
 const {FINANCING_PAYMENT_METHODS,financingPaymentMethodLabel,sanitizeFinancingPaymentMethod}=await import('../src/lib/financing-payment-method');
 for(const method of FINANCING_PAYMENT_METHODS){assert.equal(sanitizeFinancingPaymentMethod(method.value),method.value);assert.equal(financingPaymentMethodLabel(method.value),method.label);}
 for(const invalid of [null,{},123,'','PIX','unknown'])assert.equal(sanitizeFinancingPaymentMethod(invalid),undefined);
 assert.equal(financingPaymentMethodLabel(),'Não informada');
});

test('person avatars preserve custom letters and fall back to name initials for old records',async()=>{
 const {customAvatarLetters,personAvatarLetters}=await import('../src/lib/person-avatar');
 assert.equal(customAvatarLetters(' j.s 123'),'JS1');assert.equal(customAvatarLetters('a\u0301l!'),'ÁL');
 assert.equal(personAvatarLetters('Ana Paula'),'AP');assert.equal(personAvatarLetters('Ana Paula','JS'),'JS');assert.equal(personAvatarLetters('',''),'NP');
});
test('person emoji selection preserves joined sequences and skin tones',async()=>{
 const {firstAvatarEmoji}=await import('../src/lib/person-avatar');
 for(const e of ['👩🏽‍💼','👨‍👩‍👧‍👦','🇧🇷','💙'])assert.equal(firstAvatarEmoji(e+'🌸'),e);
 assert.equal(firstAvatarEmoji('  '),'');
});

import {buildLoanReminder,reminderContacts,reminderPhone,reminderWhatsAppUrl} from '../src/lib/loan-reminder';
const cleanMessage=(text:string)=>text.replace(/\u00a0/g,' ');
test('loan reminder uses selected installment outstanding and only this operation total',()=>{
 const part={...loan,id:'part2',loanId:'series',installment:2,installments:4,amount:100,description:'Compra & serviço',receipts:[{id:'r',amount:25,date:'2026-10-01',transactionId:'tx'}]};
 const rows=[part,{...part,id:'part1',installment:1,status:'paid' as const},{...part,id:'part3',installment:3,receipts:[]},{...part,id:'part4',installment:4,receipts:[]},{...part,id:'other',loanId:'unrelated',amount:999},{...part,id:'card',operationType:'card' as const,amount:999}];
 const text=cleanMessage(buildLoanReminder(part,rows));
 assert.match(text,/parcela 2\/4: Compra & serviço/);assert.match(text,/nesta parcela: R\$ 75,00/);assert.match(text,/Vencimento: 10\/10\/2026/);assert.match(text,/deste empréstimo: R\$ 275,00/);assert.equal(text.includes('999'),false);
 assert.equal(buildLoanReminder({...part,status:'paid'},rows),'');
});
test('free reminder uses suggested receipt without inventing installments or dates',()=>{
 const free={...loan,collectionMode:'open' as const,freePaymentMode:'installments' as const,suggestedPaymentAmount:30,amount:100};
 const text=cleanMessage(buildLoanReminder(free,[free]));assert.match(text,/este pagamento: R\$ 30,00/);assert.match(text,/Vencimento: a combinar/);assert.match(text,/empréstimo: R\$ 100,00/);assert.equal(text.includes('parcela'),false);
});
test('borrowed card reminder sums same purchase with cent precision and no duplicated rows',()=>{
 const item={...loan,operationType:'card' as const,amount:0.1,dueDate:undefined,createdAt:'2026-10-01'};
 const text=cleanMessage(buildLoanReminder(item,[item,item,{...item,id:'next',amount:0.2}]));assert.match(text,/desta compra: R\$ 0,30/);assert.match(text,/Vencimento: a combinar/);
});
test('reminder recipient matching uses full normalized name, never nickname or substring',()=>{
 const people=[{name:'  ANA   PAULA ',phone:'1'},{name:'Ana',nickname:'Ana Paula'},{name:'Ana Paula Silva'},{name:'Ana Paula',phone:'2'}];
 assert.deepEqual(reminderContacts('Ana Paula',people),[people[0],people[3]]);assert.deepEqual(reminderContacts('',people),[]);
});
test('WhatsApp reminder validates DDD and preserves international country prefix',()=>{
 assert.equal(reminderPhone('(11) 99999-8888'),'5511999998888');assert.equal(reminderPhone('+55 11 99999-8888'),'5511999998888');assert.equal(reminderPhone('5511999998888'),'5511999998888');assert.equal(reminderPhone('+1 415 555 2671'),'14155552671');
 for(const invalid of [undefined,'','99999-8888','WhatsApp 11999998888','0000000000','+55 11 9','javascript:alert(1)'])assert.equal(reminderPhone(invalid),null);
});
test('WhatsApp URL carries the edited message exactly and empty messages cannot open it',()=>{
 const message='Olá, Ana!\nR$ 75,00 & parcela 2/4? #lembrete';const url=reminderWhatsAppUrl('(11) 99999-8888',message);assert.ok(url);assert.equal(new URL(url).origin,'https://wa.me');assert.equal(new URL(url).searchParams.get('text'),message);assert.equal(reminderWhatsAppUrl('',message),null);assert.equal(reminderWhatsAppUrl('11999998888','  '),null);
});
