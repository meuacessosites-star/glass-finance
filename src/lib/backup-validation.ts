export function inspectBackup(raw:string){
 if(raw.length>20_000_000)throw new Error('Arquivo muito grande. O limite de leitura é 20 MB.');
 const data=JSON.parse(raw);
 if(!data||!Array.isArray(data.profiles)||!data.profiles.length)throw new Error('Este arquivo não contém perfis do GranaScan. Use um backup exportado pela aba Conta.');
 const ids=new Set<string>();
 for(const p of data.profiles){
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!p.data||typeof p.data!=='object'||!Array.isArray(p.data.transactions))throw new Error('Há um perfil incompleto ou duplicado no arquivo. Nenhum dado foi alterado.');
  ids.add(p.id);
  for(const field of ['categories','cards','loanReceivables','people','reserves','notifications','financings','goals'])if(p.data[field]!==undefined&&!Array.isArray(p.data[field]))throw new Error('O arquivo tem uma área de dados inválida.');
 }
 return {profiles:data.profiles.length,transactions:data.profiles.reduce((s:number,p:any)=>s+p.data.transactions.length,0),names:data.profiles.map((p:any)=>p.name).join(', ')};
}
