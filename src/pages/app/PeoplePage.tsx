import { PersonAppearanceEditor } from "@/components/app/PersonAppearanceEditor";
import { PersonAvatar } from "@/components/app/PersonAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fileToAvatarDataUrl } from "@/components/app/AvatarEditor";
import { customAvatarLetters, firstAvatarEmoji } from "@/lib/person-avatar";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
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

type PersonRecord = {_id:Id<"people">;name:string;nickname?:string;phone?:string;avatarType?:"letters"|"emoji"|"foto";avatarValue?:string;avatarColor?:string};

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
  const [nickname,setNickname]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [phone, setPhone] = useState("");
  const [avatarType,setAvatarType]=useState<"letters"|"emoji"|"foto">("letters");
  const [avatarColor,setAvatarColor]=useState("#2F6BFF");
  const [letters,setLetters]=useState("");
  const [emoji,setEmoji]=useState("🙂");
  const [photo,setPhoto]=useState("");
  const [hex,setHex]=useState("#2F6BFF");
  const selectColor=(color:string)=>{setAvatarColor(color);setHex(color.toUpperCase())};
  const [photoBusy,setPhotoBusy]=useState(false);
  const avatarOptions={avatarType,avatarColor,avatarValue:avatarType==='letters'?customAvatarLetters(letters):avatarType==='emoji'?firstAvatarEmoji(emoji):photo};
  async function uploadPhoto(file?:File){
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10_000_000){toast.error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');return;}
    setPhotoBusy(true);
    try{setPhoto(await fileToAvatarDataUrl(file));setAvatarType('foto');}catch{toast.error('Não foi possível abrir a foto. Tente outra imagem.');}finally{setPhotoBusy(false);}
  }
  const [editingId, setEditingId] = useState<Id<"people"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"people"> | null>(null);

  const startEdit = (id: Id<"people">) => {
    const person = people?.find((p) => p._id === id);
    if (!person) return;
    setEditingId(id);
    setName(person.name);setNickname(person.nickname??'');
    setPhone(person.phone ?? "");
    setAvatarType(person.avatarType??'letters');selectColor(person.avatarColor??tintFor(person.name));
    setLetters(person.avatarType==='letters'||!person.avatarType?person.avatarValue??'':'');setEmoji(person.avatarType==='emoji'?person.avatarValue||'🙂':'🙂');setPhoto(person.avatarType==='foto'?person.avatarValue??'':'');setFormOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setPhone("");setNickname("");setAvatarType("letters");selectColor("#2F6BFF");setLetters("");setEmoji("🙂");setPhoto("");setFormOpen(false);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome à pessoa");
      return;
    }
    if (people?.some(p=>p._id!==editingId && contactKey(p.name)===contactKey(trimmed))) {toast.error("Já existe um contato com esse nome. Use um nome distinto para identificar a pessoa.");return;}
    if (isSaving||photoBusy) return;
    if(avatarType==='foto'&&!photo){toast.error('Escolha uma foto ou use as iniciais.');return;}

    if(avatarType==='emoji'&&!firstAvatarEmoji(emoji)){toast.error('Escolha um emoji para o avatar.');return;}
    if(avatarType!=='foto'&&!/^#[0-9a-f]{6}$/i.test(hex)){toast.error('Complete o código HEX da cor antes de salvar.');return;}
    const digits = phone.replace(/\D/g, "").slice(0, 15);
    setIsSaving(true);
    try {
      if (editingId) {
        await updatePerson({
          ...avatarOptions,
          nickname:nickname.trim(),
          id: editingId,
          name: trimmed,
          phone: digits || undefined,
        });
        toast("Pessoa atualizada");
      } else {
        await createPerson({ name: trimmed, nickname:nickname.trim(), phone: digits || undefined, ...avatarOptions });
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
      <input className="planning-search" aria-label="Buscar nome, apelido ou telefone" placeholder="Buscar nome, apelido ou telefone…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="planning-actions planning-filters">{[['all','Todas'],['pending','Com valores a receber'],['overdue','Em atraso']].map(([v,label])=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{label}</button>)}</div>
      <p className="planning-muted">Os empréstimos abaixo pertencem ao perfil ativo. A associação usa o nome completo, sem diferenciar maiúsculas; nomes iguais são agrupados. Use nomes distintos para pessoas diferentes. Editar um contato não renomeia empréstimos antigos.</p>
      <div className="planning-actions"><button className="planning-primary" onClick={()=>{cancelEdit();setFormOpen(true)}}><Plus size={17}/>Adicionar pessoa</button></div>
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
            return (person.name+' '+(person.nickname??'')+' '+(person.phone??'')).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) && (view==='all'||view==='pending'&&info.outstanding>0||view==='overdue'&&info.overdue>0);
          }).map((person) => {
            const info=contactLoans(person.name,loanReceivables,today);
            const wa = waHref(person);
            return (
              <article key={person._id} className="py-3"><div className="flex flex-wrap items-center gap-3">
                <PersonAvatar name={person.name} avatarType={person.avatarType} avatarValue={person.avatarValue} backgroundColor={person.avatarColor??tintFor(person.name)} className="size-11"/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-glass-ink">
                    {person.name}
                  </p>
                  {person.nickname&&<p className="text-xs text-glass-sub">{person.nickname}</p>}
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

      {people&&loanReceivables.some(r=>!people.some(p=>contactKey(p.name)===contactKey(r.contact)))&&<section className="planning-card"><h2>Pessoas dos empréstimos sem contato</h2><p className="planning-muted">Os valores já estão incluídos no resumo acima. Cadastre o contato ou abra os empréstimos.</p>{[...new Map(loanReceivables.filter(r=>!people.some(p=>contactKey(p.name)===contactKey(r.contact))).map(r=>[contactKey(r.contact),r.contact])).values()].filter(n=>n.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(n=>{const info=contactLoans(n,loanReceivables,today);if(view==='pending'&&info.outstanding===0||view==='overdue'&&!info.overdue)return null;return <div key={n} className="planning-row flex-wrap"><div><strong>{n}</strong><p>A receber: {money(info.outstanding)}</p></div><div className="planning-actions"><button onClick={()=>{cancelEdit();setName(n);setFormOpen(true)}}>Cadastrar contato</button><button onClick={()=>navigate('/dashboard/emprestimos',{state:{receivableId:info.rows[0].id}})}>Ver empréstimo</button></div></div>})}</section>}
      <Dialog open={formOpen} onOpenChange={open=>{if(!isSaving&&!photoBusy){if(!open)cancelEdit();else setFormOpen(true)}}}>
        <DialogContent className="planning-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 text-glass-ink">
          <DialogHeader className="shrink-0 border-b border-glass-ink/10 px-5 py-4 pr-12">
            <DialogTitle>{editingId?'Editar pessoa':'Cadastrar nova pessoa'}</DialogTitle>
            <DialogDescription>Personalize o avatar e os dados do contato. As mudanças só são salvas ao confirmar.</DialogDescription>
          </DialogHeader>
          <form id="person-form" className="min-h-0 overflow-y-auto px-5 py-4" onSubmit={e=>{e.preventDefault();void handleSave()}}>
            <PersonAppearanceEditor name={name} type={avatarType} onType={setAvatarType} letters={letters} onLetters={setLetters} emoji={emoji} onEmoji={setEmoji} photo={photo} color={avatarColor} onColor={selectColor} hex={hex} onHex={v=>{setHex(v);if(/^#[0-9a-f]{6}$/i.test(v))setAvatarColor(v.toUpperCase())}} photoBusy={photoBusy} onPhoto={file=>{void uploadPhoto(file)}}/>
            <fieldset className="mt-5 space-y-3 border-t border-glass-ink/10 pt-4">
              <legend className="px-1 text-sm font-semibold">Informações pessoais</legend>
              <label className="grid gap-1.5 text-sm font-semibold">Nome completo *<input required aria-label="Nome da pessoa" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Ana Paula" maxLength={40} className={inputClass}/></label>
              <label className="grid gap-1.5 text-sm font-semibold">Apelido (opcional)<input aria-label="Apelido da pessoa" value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={40} placeholder="Como você chama essa pessoa" className={inputClass}/></label>
              <label className="grid gap-1.5 text-sm font-semibold">Telefone (opcional)<input aria-label="Telefone da pessoa" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" maxLength={20} className={inputClass}/></label>
              <p className="text-xs text-glass-sub">O nome completo continua identificando os empréstimos. O apelido serve para exibição e busca.</p>
            </fieldset>
          </form>
          <div className="flex shrink-0 gap-3 border-t border-glass-ink/10 px-5 py-4">
            <button type="button" disabled={isSaving||photoBusy} onClick={cancelEdit} className="min-h-11 flex-1 rounded-xl border border-glass-ink/20 px-3 font-semibold">Cancelar</button>
            <button type="submit" form="person-form" disabled={isSaving||photoBusy||!name.trim()} className="min-h-11 flex-1 rounded-xl bg-primary px-3 font-semibold text-white disabled:opacity-50">{isSaving?'Salvando…':'Salvar'}</button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        O ícone verde abre o WhatsApp com uma mensagem de cobrança pronta. Se o
        número for só telefone, ele continua salvo aqui para consulta.
      </p>
      {removing&&<ConfirmAction title={`Excluir contato de ${removing.name}?`} description="Remove apenas o contato. Empréstimos e recebimentos permanecem salvos e podem ser consultados nesta página." action="Excluir contato" onCancel={()=>setRemoving(null)} onConfirm={()=>{void handleDelete(removing._id);setRemoving(null)}}/>}
    </div>
  );
}
