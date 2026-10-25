import { InlineColorPicker } from "@/components/app/CategoryColorPicker";
import { financialOverview } from "@/lib/financial-overview";
import { ConfirmAction } from '@/components/app/PlanningUI';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { goalPlan } from '@/lib/financing-plan';
import { localDateKey } from '@/lib/card-billing';
import { getTransactionPaymentStatus } from '@/lib/transaction-status';
import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Target, Trash2, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import {
  formatCurrency,
  monthKey,
  monthTotals,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#FF9500",
  "#2F6BFF",
  "#AF52DE",
  "#1FBF4F",
  "#FF2D55",
  "#00C7BE",
  "#5856D6",
  "#0A84FF",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return Infinity;
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export default function GoalsPage() {
  const formatCurrency = usePrivateCurrency();
  const {
    goals, cards, loanReceivables,
    activeProfile,
    visibleTransactions,
    addGoal,
    updateGoal,
    deleteGoal,
  } = useAppStore();

  const [query,setQuery]=useState('');
  const [view,setView]=useState('active');
  const [removing,setRemoving]=useState<string|null>(null);
  const [contribution,setContribution]=useState<{id:string;kind:'add'|'remove';amount:number}|null>(null);
  const [name, setName] = useState("");
  const [targetCents, setTargetCents] = useState(0);
  const [savedCents, setSavedCents] = useState(0);
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sobra média mensal do perfil (receitas − despesas) em todos os meses.
  const history = useMemo(() => {
    const current=localDateKey().slice(0,7);
    const historical=visibleTransactions.filter(t=>t.date.slice(0,7)<current);
    const keys = [...new Set(historical.map((t) => monthKey(t.date)))].sort().slice(-6);
    const surpluses = keys.map((key) => {
      if(!activeProfile)return 0;
      const overview=financialOverview(activeProfile.data,key,localDateKey());
      return overview.received-overview.paid;
    });
    if (surpluses.length === 0) return {amount:0,count:0};
    return {amount:surpluses.reduce((s, x) => s + x, 0) / surpluses.length,count:surpluses.length};
  }, [visibleTransactions,activeProfile]);

  const monthlySurplus=history.amount;
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const completedCount = goals.filter((g) => g.savedAmount >= g.targetAmount).length;
  const today = localDateKey();
  const neededTotal=goals.reduce((s,g)=>s+(goalPlan(g,today).monthly??0),0);
  const activeCount=Math.max(1,goals.filter(g=>g.savedAmount<g.targetAmount).length);
  const monthlyShare=Math.max(0,monthlySurplus)/activeCount;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome à meta");
      return;
    }
    if (!Number.isFinite(targetCents) || targetCents <= 0 || targetCents>1e11 || !Number.isFinite(savedCents) || savedCents<0 || savedCents>1e11) {
      toast("Informe um valor alvo maior que zero");
      return;
    }
    const data = {
      name: trimmed,
      targetAmount: targetCents / 100,
      savedAmount: savedCents / 100,
      deadline: deadline || undefined,
      color,
    };
    if (editingId) {
      updateGoal(editingId, data);
      toast("Meta atualizada");
    } else {
      addGoal(data);
      toast("Meta criada 🎯");
    }
    cancelEdit();
  };

  const startEdit = (id: string) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    setEditingId(id);
    setName(g.name);
    setTargetCents(Math.round(g.targetAmount * 100));
    setSavedCents(Math.round(g.savedAmount * 100));
    setDeadline(g.deadline ?? "");
    setColor(g.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setTargetCents(0);
    setSavedCents(0);
    setDeadline("");
    setColor(PALETTE[0]);
  };

  /** Dica individual calculada com base no perfil do usuário. */
  const tipFor = (g: { targetAmount: number; savedAmount: number; deadline?: string }) => {
    const remaining = Math.max(0, g.targetAmount - g.savedAmount);
    if (remaining <= 0) {
      return {
        tone: "positive" as const,
        text: "Meta concluída! 🎉 Que tal definir a próxima?",
      };
    }
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    if (!g.deadline) {
      const months = monthlyShare > 0 ? Math.ceil(remaining / monthlyShare) : Infinity;
      return {
        tone: "info" as const,
        text:
          months === Infinity
            ? `Faltam ${formatCurrency(remaining)}. Com sua sobra atual, ainda não dá para estimar um prazo.`
            : `Faltam ${formatCurrency(remaining)} (${pct}%). Se dividir a sobra histórica entre as metas, ${formatCurrency(
                monthlyShare,
              )}/mês, você conclui em cerca de ${months} ${months === 1 ? "mês" : "meses"}.`,
      };
    }
    const monthsLeft = goalPlan(g,today).months ?? 1;
    if (g.deadline < today) {
      return {
        tone: "warning" as const,
        text: `O prazo (${g.deadline.split("-").reverse().join("/")}) já chegou — redefina a data ou aumente o valor guardado.`,
      };
    }
    const needed = Math.ceil(remaining / monthsLeft*100)/100;
    if(!history.count)return {tone:"info" as const,text:`Para alcançar no prazo, reserve ${formatCurrency(needed)}/mês. Ainda não há meses encerrados suficientes para comparar com sua capacidade; confira suas contas antes de definir a contribuição.`};
    if (needed <= monthlyShare) {
      return {
        tone: "positive" as const,
        text: `Guardando ${formatCurrency(needed)}/mês você chega em ${monthsLeft} ${monthsLeft === 1 ? "mês" : "meses"} — dentro da divisão indicativa de ${formatCurrency(monthlyShare)}/mês entre as metas.`,
      };
    }
    return {
      tone: "warning" as const,
      text: `Precisaria guardar ${formatCurrency(needed)}/mês, acima da divisão indicativa de ${formatCurrency(
        monthlyShare,
      )}/mês. Considere estender o prazo ou reduzir a meta.`,
    };
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Metas" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Objetivos de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        defina, acompanhe e receba dicas do seu próprio perfil.
      </p>

      {/* Summary */}
      <div className="glass glass-strong relative overflow-hidden rounded-[1.8rem] p-4">
        <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[#FF9500]/20 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF9500]/15">
            <Target className="size-6 text-[#FF9500]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-glass-sub">
              {completedCount} de {goals.length} concluídas
            </p>
            <p className="amount-tabular mt-0.5 text-[20px] font-bold leading-none text-glass-ink">
              {formatCurrency(totalSaved)}
              <span className="text-[13px] font-semibold text-glass-faint">
                {" "}
                de {formatCurrency(totalTarget)}
              </span>
            </p>
          </div>
          <TrendingUp className="size-5 shrink-0 text-[#17a443]" />
        </div>
      </div>

      {/* Capacity insight */}
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1FBF4F]/15">
          <TrendingUp className="size-4 text-[#17a443]" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-glass-sub">
          Sua <span className="font-bold text-glass-ink">sobra média mensal</span> é{" "}
          <span className="amount-tabular font-bold text-[#17a443]">
            {formatCurrency(monthlySurplus)}
          </span>
          . Média de até 6 meses encerrados com registros, usando entradas e saídas marcadas como pagas. Não é garantia de capacidade futura; meses sem registro ficam fora.
        </p>
      </div>

      <p className="planning-notice">Metas com prazo, juntas: {formatCurrency(neededTotal)}/mês. Compare com a sobra disponível antes de distribuir entre os objetivos. Progresso de metas não movimenta a conta e não deve ser somado novamente às Reservas.</p>
      <input className="planning-search" aria-label="Buscar metas" placeholder="Buscar metas" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="planning-actions planning-filters">{[['active','Em andamento'],['done','Concluídas'],['all','Todas']].map(([v,l])=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{l}</button>)}</div>
      {goals.length>0&&!goals.some(g=>g.name.toLowerCase().includes(query.toLowerCase())&&(view==='all'||(view==='done'?g.savedAmount>=g.targetAmount:g.savedAmount<g.targetAmount)))&&<p className="planning-muted">Nenhuma meta neste filtro.</p>}
      {/* List */}
      {goals.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#FF9500]/15">
            <Target className="size-6 text-[#FF9500]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma meta ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Crie um objetivo (viagem, reserva de emergência, investimento) e
              receba dicas de como alcançá-lo.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())&&(view==='all'||(view==='done'?g.savedAmount>=g.targetAmount:g.savedAmount<g.targetAmount))).map((g) => {
            const pct = Math.min(
              100,
              Math.round((g.savedAmount / g.targetAmount) * 100),
            );
            const done = g.savedAmount >= g.targetAmount;
            const tip = tipFor(g);
            return (
              <div key={g.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: g.color }}
                  >
                    <Target className="size-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-glass-ink">
                      {g.name}
                    </p>
                    <p className="amount-tabular mt-0.5 text-[13.5px] font-semibold text-glass-sub">
                      {formatCurrency(g.savedAmount)}{" "}
                      <span className="text-glass-faint">de {formatCurrency(g.targetAmount)}</span>
                      {g.deadline && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[11.5px] text-glass-faint">
                          <CalendarClock className="size-3" />
                          até {g.deadline.split("-").reverse().join("/")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Editar ${g.name}`}
                      onClick={() => startEdit(g.id)}
                      className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${g.name}`}
                      onClick={() => {
                        setRemoving(g.id);
                      }}
                      className="flex size-11 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30] transition-transform active:scale-90"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="planning-actions mt-3"><button onClick={()=>setContribution({id:g.id,kind:'add',amount:0})}>Registrar contribuição</button><button disabled={g.savedAmount<=0} onClick={()=>setContribution({id:g.id,kind:'remove',amount:0})}>Registrar retirada</button></div>
                {!!g.movements?.length&&<details><summary className="planning-muted mt-2">Histórico de ajustes ({g.movements.length})</summary><div className="max-h-48 overflow-auto">{[...g.movements].reverse().map(m=><p className="planning-row" key={m.id}><span>{m.date.split('-').reverse().join('/')}</span><strong>{m.amount>0?'+':''}{formatCurrency(m.amount)}</strong></p>)}</div></details>}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-black/25">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(0, done ? 100 : pct)}%`, backgroundColor: g.color }}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
                    tip.tone === "positive" && "bg-[#1FBF4F]/10 text-[#17a443]",
                    tip.tone === "warning" && "bg-[#FF9500]/10 text-[#c77700]",
                    tip.tone === "info" && "bg-primary/5 text-glass-sub",
                  )}
                >
                  {tip.text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit form */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-glass-ink">
            {editingId ? "Editar meta" : "Nova meta"}
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
          aria-label="Nome da meta"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Viagem para o Japão)"
          maxLength={40}
          className={cn(inputClass, "mt-3")}
        />

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Valor alvo
            </p>
            <input
              inputMode="numeric"
              value={formatBRL(targetCents)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setTargetCents(digits ? Number(digits) : 0);
              }}
              aria-label="Valor alvo"
              className={cn(inputClass, "mt-2 text-center")}
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Já guardado
            </p>
            <input
              inputMode="numeric"
              value={formatBRL(savedCents)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setSavedCents(digits ? Number(digits) : 0);
              }}
              aria-label="Valor já guardado"
              className={cn(inputClass, "mt-2 text-center")}
            />
          </div>
        </div>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Prazo <span className="normal-case text-glass-faint">(opcional)</span>
        </p>
        <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
          <CalendarClock className="size-4 shrink-0 text-glass-sub" />
          <input
            type="date"
            aria-label="Prazo da meta"
            value={deadline}
            min={today}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </label>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Cor
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-8 rounded-full transition-transform active:scale-90",
                color === c &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="mt-3"><InlineColorPicker value={color} onChange={setColor}/></div>

        <button
          type="button"
          onClick={handleSave}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          {editingId ? "Salvar alterações" : "Criar meta"}
        </button>
      </div>
      {removing&&<ConfirmAction title="Excluir meta?" description="O objetivo e seu histórico de ajustes serão removidos. Isso não altera o saldo bancário ou suas reservas." action="Excluir" onCancel={()=>setRemoving(null)} onConfirm={()=>{deleteGoal(removing);if(editingId===removing)cancelEdit();setRemoving(null)}}/>}
      <Dialog open={!!contribution} onOpenChange={o=>{if(!o)setContribution(null)}}><DialogContent className="planning-dialog"><DialogHeader><DialogTitle>{contribution?.kind==='remove'?'Retirada':'Contribuição'} da meta</DialogTitle><DialogDescription>Atualiza apenas o progresso registrado. Nenhum dinheiro é transferido.</DialogDescription></DialogHeader>{contribution&&<form className="planning-form" onSubmit={e=>{e.preventDefault();const g=goals.find(g=>g.id===contribution.id);if(!g||contribution.amount<=0||!Number.isFinite(contribution.amount))return;const next=Math.round((g.savedAmount+(contribution.kind==='add'?1:-1)*contribution.amount)*100)/100;if(next<0||next>1e9){toast.error('Confira o valor disponível na meta.');return;}updateGoal(g.id,{savedAmount:next});setContribution(null);toast.success('Progresso atualizado',{duration:1800})}}><label>Valor (R$)<input required type="number" min="0.01" max="1000000000" step="0.01" value={contribution.amount||''} onChange={e=>setContribution({...contribution,amount:Number(e.target.value)})}/></label><button className="planning-button planning-primary">Confirmar</button></form>}</DialogContent></Dialog>
    </div>
  );
}
