import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReserves, recordReserveMovement, reserveProgress } from '../src/lib/reserves';
const legacy = {id:'r1',name:'Viagem',amount:100.10,color:'#8458CB',createdAt:'2025-01-01'};
const movement = (id:string,kind:'deposit'|'withdrawal',amount:number) => ({id,kind,amount,date:'2025-02-01',note:'Registro'});
test('legacy reserve retains exact balance and gains opening history once',()=>{
 const [r]=sanitizeReserves([legacy]); assert.equal(r.amount,100.10); assert.equal(r.movements?.[0].kind,'opening'); assert.equal(r.movements?.[0].amount,100.10); assert.deepEqual(sanitizeReserves([r]),[r]);
});
test('zero balance reserve survives reload without invented movement',()=>{
 const [r]=sanitizeReserves([{...legacy,amount:0}]); assert.equal(r.amount,0);assert.deepEqual(r.movements,[]);assert.deepEqual(sanitizeReserves([r]),[r]);
});
test('deposit and withdrawal use cents and preserve earlier history',()=>{
 const r=recordReserveMovement(legacy,movement('m1','deposit',0.20));
 const next=recordReserveMovement(r,movement('m2','withdrawal',0.30));
 assert.equal(next.amount,100);assert.equal(next.movements?.length,3);assert.equal(legacy.amount,100.10);assert.deepEqual(sanitizeReserves([next]),[next]);
});
test('full withdrawal leaves an empty reserve with its history',()=>{
 const r=recordReserveMovement(legacy,movement('m1','withdrawal',100.10)); assert.equal(r.amount,0);assert.equal(r.movements?.length,2);assert.deepEqual(sanitizeReserves([r]),[r]);
});
test('overdraw, invalid amounts and future dates never change balance',()=>{
 for(const amount of [-1,0,NaN,Infinity,100.11]) assert.equal(recordReserveMovement(legacy,movement('m1','withdrawal',amount)),legacy);
 assert.equal(recordReserveMovement(legacy,{...movement('m1','deposit',1),date:'2099-01-01'}),legacy);
 assert.equal(recordReserveMovement(legacy,{...movement('m1','deposit',1),date:'invalid'}),legacy);
});
test('repeated movement ID cannot credit reserve twice',()=>{
 const r=recordReserveMovement(legacy,movement('m1','deposit',50));assert.equal(recordReserveMovement(r,movement('m1','deposit',50)),r);assert.equal(r.amount,150.10);
});
test('targets cap progress without capping saved money',()=>{
 assert.deepEqual(reserveProgress({...legacy,target:200.20}),{target:200.20,remaining:100.10,percent:50,complete:false});
 assert.deepEqual(reserveProgress({...legacy,target:80}),{target:80,remaining:0,percent:100,complete:true});
 assert.equal(reserveProgress(legacy).complete,false);
});
test('import retains authoritative balance and valid metadata despite malformed history',()=>{
 const [r]=sanitizeReserves([{...legacy,target:500,deadline:'2026-12-31',note:'Meu plano',movements:[movement('m1','deposit',30),movement('m1','deposit',30),{...movement('bad','deposit',20),date:'bad'}]}]);
 assert.equal(r.amount,100.10);assert.equal(r.target,500);assert.equal(r.note,'Meu plano');assert.equal(r.movements?.length,2);assert.deepEqual(sanitizeReserves([r]),[r]);
});

test('CDI simulation is optional and does not mutate balance or movements', async()=>{
 const {simulateReserveYield,sanitizeReserveYield}=await import('../src/lib/reserves');
 const [r]=sanitizeReserves([legacy]);const before=JSON.stringify(r);
 assert.equal(simulateReserveYield(r.amount,sanitizeReserveYield(null)),null);
 const result=simulateReserveYield(r.amount,{enabled:true,cdiPercent:100,annualCdi:10,months:12});
 assert.equal(result?.gain,10.01); assert.equal(result?.days,252);assert.equal(JSON.stringify(r),before);
});
test('CDI projection uses daily percentage and handles zero and missing reference',async()=>{
 const {simulateReserveYield}=await import('../src/lib/reserves');
 assert.equal(simulateReserveYield(1000,{enabled:true,cdiPercent:100,annualCdi:null,months:1}),null);
 assert.equal(simulateReserveYield(1000,{enabled:true,cdiPercent:0,annualCdi:10,months:12})?.gain,0);
 assert.equal(simulateReserveYield(0,{enabled:true,cdiPercent:120,annualCdi:10,months:12})?.total,0);
 const r=simulateReserveYield(1000,{enabled:true,cdiPercent:120,annualCdi:10,months:12});
 assert.equal(r?.gain,Math.round(1000*(Math.pow(1+(Math.pow(1.1,1/252)-1)*1.2,252)-1)*100)/100);
});
test('yield settings and location survive import without discarding legacy metadata',()=>{
 const [r]=sanitizeReserves([{...legacy,target:500,deadline:'2027-01-01',location:'Banco',yield:{enabled:true,cdiPercent:110,annualCdi:10,months:6}}]);
 assert.equal(r.target,500);assert.equal(r.location,'Banco');assert.deepEqual(r.yield,{enabled:true,cdiPercent:110,annualCdi:10,months:6});assert.deepEqual(sanitizeReserves([r]),[r]);
});
