import { InlineColorPicker } from "@/components/app/CategoryColorPicker";
import { fileToAvatarDataUrl } from "@/components/app/AvatarEditor";
import { avatarInk } from "@/lib/person-avatar";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { GenericId } from "convex/values";
type Id<T extends string> = GenericId<T>;
import { useNavigate } from "react-router";
import { contactKey,contactLoans,whatsappNumber } from "@/lib/people-summary";
import { localDateKey } from "@/lib/card-billing";
import { getLoanOutstandingAmount } from "@/lib/loan-repayments";
import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { ConfirmAction,PlanningMetric } from "@/components/app/PlanningUI";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import { initials } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type PersonRecord = {_id:Id<"people">;name:string;phone?:string;avatarType?:"letters"|"emoji"|"foto";avatarValue?:string;avatarColor?:string};

const tintFor = (name: string) => {
  const palette = ["#2F6BFF", "#AF52DE", "#1FBF4F", "#FF9500", "#FF2D55", "#00C7BE"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
};

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

/** Exibe o número armazenado (dígitos) no formato brasileiro comum. */
function formatPhone(digits: string) {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export default function PeoplePage() {
  const { activeProfile,loanReceivables } = useAppStore();
  const navigate=useNavigate(); const money=usePrivateCurrency();
  const [query,setQuery]=useState(''); const [view,setView]=useState('all');
  const [removing,setRemoving]=useState<PersonRecord|null>(null);
  const today=localDateKey();
  const people = useQuery(api.people.list) as PersonRecord[] | undefined;
  const createPerson = useMutation(api.people.create);
  const updatePerson = useMutation(api.people.update);
  const removePerson = useMutation(api.people.remove);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarType,setAvatarType]=useState<"letters"|"emoji"|"foto">("letters");
  const [avatarColor,setAvatarColor]=useState("#2F6BFF");
  const [avatarValue,setAvatarValue]=useState("");
  const [photoBusy,setPhotoBusy]=useState(false);
  const avatarOptions={avatarType,avatarColor,avatarValue:avatarType==='letters'?'':avatarValue};
  async function uploadPhoto(file?:File){
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10_000_000){toast.error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');return;}
    setPhotoBusy(true);
    try{setAvatarValue(await fileToAvatarDataUrl(file));setAvatarType('foto');}catch{toast.error('Não foi possível abrir a foto. Tente outra imagem.');}finally{setPhotoBusy(false);}
  }
  const [editingId, setEditingId] = useState<Id<"people"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"people"> | null>(null);

  const startEdit = (id: Id<"people">) => {
    const person = people?.find((p) => p._id === id);
    if (!person) return;
    setEditingId(id);
    setName(person.name);
    setPhone(person.phone ?? "");
    setAvatarType(person.avatarType??'letters');setAvatarColor(person.avatarColor??tintFor(person.name));setAvatarValue(person.avatarValue??'');
    document.getElementById('person-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setPhone("");setAvatarType("letters");setAvatarColor("#2F6BFF");setAvatarValue("");
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome à pessoa");
      return;
    }
    if (people?.some(p=>p._id!==editingId && contactKey(p.name)===contactKey(trimmed))) {toast.error("Já existe um contato com esse nome. Use um nome distinto para identificar a pessoa.");return;}
    if (isSaving||photoBusy) return;
    if(avatarType==='foto'&&!avatarValue){toast.error('Escolha uma foto ou use as iniciais.');return;}

    const digits = phone.replace(/\D/g, "").slice(0, 15);
    setIsSaving(true);
    try {
      if (editingId) {
        await updatePerson({
          ...avatarOptions,
          id: editingId,
          name: trimmed,
          phone: digits || undefined,
        });
        toast("Pessoa atualizada");
      } else {
        await createPerson({ name: trimmed, phone: digits || undefined, ...avatarOptions });
        toast("Pessoa adicionada");
      }
      cancelEdit();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a pessoa",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: Id<"people">) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await removePerson({ id });
      if (editingId === id) cancelEdit();
      toast("Pessoa removida");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível remover a pessoa",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const waHref = (person: Pick<PersonRecord, "name" | "phone">) => {
    const digits = whatsappNumber(person.phone??"");
    if (!digits) return null;
    const firstName = person.name.trim().split(" ")[0] || person.name;
    const message = `Oi ${firstName}! Tudo bem? Vim lembrar daquele valor combinado 😊`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="planning-page">
      <SettingsHeader title="Pessoas" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Contatos de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        guarde o WhatsApp ou telefone para cobranças.
      </p>

      <div className="planning-grid"><PlanningMetric label="A receber de pessoas" value={money(loanReceivables.reduce((s,r)=>s+getLoanOutstandingAmount(r),0))} tone="amber"/><PlanningMetric label="Recebimentos vencidos" value={loanReceivables.filter(r=>r.dueDate&&r.dueDate<today&&getLoanOutstandingAmount(r)>0).length} tone="red"/></div>
      <input className="planning-search" aria-label="Buscar pessoa ou telefone" placeholder="Buscar pessoa ou telefone…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="planning-actions planning-filters">{[['all','Todas'],['pending','Com valores a receber'],['overdue','Em atraso']].map(([v,label])=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{label}</button>)}</div>
      <p className="planning-muted">Os empréstimos abaixo pertencem ao perfil ativo. A associação usa o nome completo, sem diferenciar maiúsculas; nomes iguais são agrupados. Use nomes distintos para pessoas diferentes. Editar um contato não renomeia empréstimos antigos.</p>
      {/* List */}
      {people === undefined ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <UserRound className="size-6 text-glass-faint" />
          </div>
          <p className="text-[13px] text-glass-sub">Carregando pessoas...</p>
        </div>
      ) : people.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <UserRound className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma pessoa ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Adicione contatos para cobrar valores e devoluções pelo WhatsApp.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
          {people.filter(person=>{
            const info=contactLoans(person.name,loanReceivables,today);
            return (person.name+' '+(person.phone??'')).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (view==='all'||view==='pending'&&info.outstanding>0||view==='overdue'&&info.overdue>0);
          }).map((person) => {
            const info=contactLoans(person.name,loanReceivables,today);
            const wa = waHref(person);
            return (
              <article key={person._id} className="py-3"><div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ backgroundColor: person.avatarColor??tintFor(person.name),color:avatarInk(person.avatarColor??tintFor(person.name)),overflow:"hidden" }}
                >
                  {person.avatarType==='foto'&&person.avatarValue?<img src={person.avatarValue} alt={`Foto de ${person.name}`} className="size-full object-cover"/>:person.avatarType==='emoji'&&person.avatarValue?person.avatarValue:initials(person.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-glass-ink">
                    {person.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-glass-sub">
                    {person.phone ? (
                      <>
                        <Phone className="size-3 text-glass-faint" />
                        {formatPhone(person.phone)}
                      </>
                    ) : (
                      "Sem número cadastrado"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Cobrar ${person.name} no WhatsApp`}
                      className="flex size-11 items-center justify-center rounded-full bg-[#1FBF4F]/15 text-[#17a443] transition-transform active:scale-90"
                    >
                      <MessageCircle className="size-[17px]" strokeWidth={2.3} />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Editar ${person.name}`}
                    onClick={() => startEdit(person._id)}
                    className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${person.name}`}
                    onClick={() => setRemoving(person)}
                    className="flex size-11 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30] transition-transform active:scale-90"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="planning-row"><span>A receber <strong>{money(info.outstanding)}</strong></span><span>Recebido <strong>{money(info.received)}</strong></span></div>
              {info.overdue>0&&<p className="planning-danger text-sm">{info.overdue} recebimento(s) em atraso</p>}
              <details><summary>{info.rows.length} registro(s) de empréstimo</summary>{info.rows.length===0?<p className="planning-muted">Nenhum empréstimo com este nome neste perfil.</p>:info.rows.map(r=><button key={r.id} className="planning-row w-full text-left" onClick={()=>navigate('/dashboard/emprestimos',{state:{receivableId:r.id}})}><span>{r.description||'Empréstimo'}<small className="block">{r.dueDate?r.dueDate.split('-').reverse().join('/'):'Sem vencimento'} · {r.operationType==='card'?'Cartão emprestado':'Dinheiro'}</small></span><strong>{money(getLoanOutstandingAmount(r))} →</strong></button>)}</details>
              </article>
            );
          })}
        </div>
      )}

      {people&&loanReceivables.some(r=>!people.some(p=>contactKey(p.name)===contactKey(r.contact)))&&<section className="planning-card"><h2>Pessoas dos empréstimos sem contato</h2><p className="planning-muted">Os valores já estão incluídos no resumo acima. Cadastre o contato ou abra os empréstimos.</p>{[...new Map(loanReceivables.filter(r=>!people.some(p=>contactKey(p.name)===contactKey(r.contact))).map(r=>[contactKey(r.contact),r.contact])).values()].filter(n=>n.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(n=>{const info=contactLoans(n,loanReceivables,today);if(view==='pending'&&info.outstanding===0||view==='overdue'&&!info.overdue)return null;return <div key={n} className="planning-row flex-wrap"><div><strong>{n}</strong><p>A receber: {money(info.outstanding)}</p></div><div className="planning-actions"><button onClick={()=>{cancelEdit();setName(n);document.getElementById('person-form')?.scrollIntoView({behavior:'smooth',block:'center'})}}>Cadastrar contato</button><button onClick={()=>navigate('/dashboard/emprestimos',{state:{receivableId:info.rows[0].id}})}>Ver empréstimo</button></div></div>})}</section>}
      {/* Add / edit form */}
      <div id="person-form" className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-glass-ink">
            {editingId ? "Editar pessoa" : "Adicionar pessoa"}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="flex min-h-11 items-center gap-1 rounded-full bg-black/5 px-3 py-2 text-[12px] font-semibold text-glass-sub transition-colors active:scale-95"
            >
              <X className="size-3.5" />
              Cancelar
            </button>
          )}
        </div>

        <input
          aria-label="Nome da pessoa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Ana Paula)"
          maxLength={40}
          className={cn(inputClass, "mt-3")}
        />
        <input
          aria-label="Telefone da pessoa"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp ou telefone (ex.: 11 99999-9999)"
          inputMode="tel"
          maxLength={20}
          className={cn(inputClass, "mt-2.5")}
        />

        <section className="mt-4 space-y-3" aria-label="Aparência da pessoa">
          <p className="text-sm font-semibold text-glass-ink">Foto ou iniciais</p>
          <div className="flex items-center gap-3"><div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-bold" style={{backgroundColor:avatarColor,color:avatarInk(avatarColor)}}>{avatarType==='foto'&&avatarValue?<img src={avatarValue} alt="Prévia da foto" className="size-full object-cover"/>:avatarType==='emoji'?avatarValue:initials(name)||'AB'}</div><div className="planning-actions planning-filters"><button type="button" aria-pressed={avatarType==='letters'} onClick={()=>setAvatarType('letters')}>Iniciais do nome</button><button type="button" aria-pressed={avatarType==='foto'} onClick={()=>{if(avatarType==='emoji')setAvatarValue('');setAvatarType('foto')}}>Foto</button></div></div>
          {avatarType==='foto'?<><label className="planning-button inline-flex cursor-pointer">{photoBusy?'Preparando foto…':avatarValue?'Trocar foto':'Escolher foto'}<input aria-label="Escolher foto da pessoa" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photoBusy||isSaving} onChange={e=>{void uploadPhoto(e.target.files?.[0]);e.target.value=''}}/></label><p className="planning-muted">JPG, PNG ou WebP até 10 MB. A imagem é reduzida e exibida em um círculo.</p></>:<><p className="planning-muted">As letras acompanham o nome. Escolha a cor de fundo; a cor das letras se ajusta para facilitar a leitura.</p><InlineColorPicker value={avatarColor} onChange={setAvatarColor}/></>}
        </section>
        <button
          type="button"
          disabled={isSaving||photoBusy}
          onClick={() => void handleSave()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          {editingId ? "Salvar alterações" : "Adicionar pessoa"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        O ícone verde abre o WhatsApp com uma mensagem de cobrança pronta. Se o
        número for só telefone, ele continua salvo aqui para consulta.
      </p>
      {removing&&<ConfirmAction title={`Excluir contato de ${removing.name}?`} description="Remove apenas o contato. Empréstimos e recebimentos permanecem salvos e podem ser consultados nesta página." action="Excluir contato" onCancel={()=>setRemoving(null)} onConfirm={()=>{void handleDelete(removing._id);setRemoving(null)}}/>}
    </div>
  );
}
