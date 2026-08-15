import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Lightbulb,
  PartyPopper,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import {
  currentMonthKey,
  formatCurrency,
  monthShortLabel,
  monthTotals,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Tip = {
  tone: "positive" | "warning" | "info";
  title: string;
  text: string;
};

export default function InsightsPage() {
  const {
    activeProfile,
    categoryById,
    visibleTransactions,
    reserves,
    goals,
    loanReceivables,
    people,
    financings,
    notifications,
  } = useAppStore();

  const month = currentMonthKey;
  const monthName = monthShortLabel(month);
  const { income, expense } = monthTotals(visibleTransactions, month);
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const savingsPct = Math.round(savingsRate * 100);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTotals(visibleTransactions, month).list) {
      if (t.amount > 0) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + Math.abs(t.amount));
    }
    return [...map.entries()]
      .map(([categoryId, value]) => ({
        categoryId,
        label: categoryById[categoryId]?.label ?? "Outros",
        color: categoryById[categoryId]?.color ?? "#8E8E93",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryById, visibleTransactions]);

  const topCategory = byCategory[0];
  const reservesTotal = reserves.reduce((s, r) => s + r.amount, 0);
  const pendingReceivables = loanReceivables.reduce((s, l) => s + l.amount, 0);
  const pendingNotifications = notifications.filter(
    (n) => n.status === "pending",
  ).length;
  const financingMonthly = financings.reduce(
    (s, f) => s + (f.currentInstallment <= f.installments ? f.installmentValue : 0),
    0,
  );
  const completedGoals = goals.filter((g) => g.savedAmount >= g.targetAmount).length;
  const financingProgress =
    financings.length > 0 &&
    financings.every((f) => f.currentInstallment > f.installments / 2);

  // Score de saúde financeira (0-100)
  const score = useMemo(() => {
    let s = 50;
    if (savingsRate >= 0.2) s += 20;
    else if (savingsRate >= 0.1) s += 12;
    else if (savingsRate >= 0.05) s += 6;
    else if (savingsRate < 0) s -= 12;
    if (reservesTotal > 0) s += 10;
    if (completedGoals > 0) s += 5;
    else if (goals.length > 0) s += 3;
    if (pendingReceivables > 0) s += 4;
    if (financings.length > 0) s -= 2;
    if (financingProgress) s += 4;
    return Math.max(0, Math.min(100, s));
  }, [savingsRate, reservesTotal, completedGoals, goals.length, pendingReceivables, financings.length, financingProgress]);

  const scoreLabel =
    score >= 80 ? "Excelente 🎉" : score >= 60 ? "Boa 💪" : score >= 40 ? "Atenção ⚠️" : "Precisa de ajustes 🔧";
  const firstName = activeProfile?.name?.trim().split(" ")[0] || "pessoa";

  const tips: Tip[] = useMemo(() => {
    const list: Tip[] = [];

    if (expense > income) {
      list.push({
        tone: "warning",
        title: "Você gastou mais do que ganhou",
        text: `Em ${monthName}, as despesas (${formatCurrency(
          expense,
        )}) passaram das receitas (${formatCurrency(income)}). Se for recorrente, revise ${
          topCategory ? `a categoria ${topCategory.label}` : "suas maiores despesas"
        } primeiro.`,
      });
    } else if (savingsRate >= 0.2) {
      list.push({
        tone: "positive",
        title: "Ótima taxa de poupança",
        text: `${savingsPct}% da sua renda de ${monthName} ficou guardada. Acima de 20% é excelente — continue assim!`,
      });
    } else if (savingsRate < 0.1) {
      list.push({
        tone: "warning",
        title: "Guarde pelo menos 10%",
        text: `Hoje você poupa ${savingsPct}% da renda. Tente separar 10% antes de gastar — automatizar isso muda o jogo.`,
      });
    } else {
      list.push({
        tone: "info",
        title: "Poupança em movimento",
        text: `Você guarda ${savingsPct}% da renda. Se chegar a 20%, sua saúde financeira sobe de patamar.`,
      });
    }

    if (topCategory) {
      list.push({
        tone: "info",
        title: `Maior despesa: ${topCategory.label}`,
        text: `${formatCurrency(topCategory.value)} em ${monthName}. Revisar essa categoria costuma ser o atalho mais rápido para economizar.`,
      });
    }

    if (reservesTotal > 0) {
      list.push({
        tone: "positive",
        title: "Você tem reservas",
        text: `${formatCurrency(reservesTotal)} guardados em cofrinhos. É o seu colchão para imprevistos — mantenha.`,
      });
    } else {
      list.push({
        tone: "info",
        title: "Crie uma reserva de emergência",
        text: "Separe o equivalente a 3–6 meses dos seus custos num cofrinho. Comece pequeno, o importante é começar.",
      });
    }

    if (goals.length === 0) {
      list.push({
        tone: "info",
        title: "Defina uma meta",
        text: "Metas dão direção à poupança. Crie a sua na aba Metas e receba dicas do quanto guardar por mês.",
      });
    } else if (completedGoals > 0) {
      list.push({
        tone: "positive",
        title: `Meta${completedGoals > 1 ? "s" : ""} concluída${completedGoals > 1 ? "s" : ""}!`,
        text: `Você já concluiu ${completedGoals} ${completedGoals > 1 ? "metas" : "meta"}. Que tal celebrar e definir a próxima?`,
      });
    } else {
      list.push({
        tone: "info",
        title: "Metas em andamento",
        text: "Você tem metas ativas na aba Metas — acompanhe a dica mensal de quanto guardar para chegar no prazo.",
      });
    }

    if (financings.length > 0) {
      list.push({
        tone: "info",
        title: "Parcelas de financiamento",
        text: `Seus financiamentos somam ${formatCurrency(
          financingMonthly,
        )}/mês. ${financingProgress ? "Mais da metade já foi paga — continue!" : "Quanto antes quitar, menos juros no total."}`,
      });
    }

    if (pendingReceivables > 0) {
      list.push({
        tone: "info",
        title: `${formatCurrency(pendingReceivables)} a receber`,
        text:
          people.length > 0
            ? "Você tem valores a receber de empréstimos — use a aba Pessoas para cobrar pelo WhatsApp com um toque."
            : "Você tem valores a receber de empréstimos. Adicione as pessoas na aba Pessoas para cobrar com um toque.",
      });
    }

    if (pendingNotifications > 0) {
      list.push({
        tone: "info",
        title: `${pendingNotifications} notificação${pendingNotifications > 1 ? "ões" : ""} aguardando`,
        text: "Aprove ou ignore os avisos dos bancos na aba Notificações — eles não entram no seu histórico até você aprovar.",
      });
    }

    list.push({
      tone: "positive",
      title: "Continue por aqui",
      text: `Registrar tudo e revisar com frequência é o que mais faz diferença. ${firstName}, você está no caminho certo!`,
    });

    return list;
  }, [expense, income, monthName, savingsPct, topCategory, reservesTotal, goals.length, completedGoals, financings.length, financingMonthly, financingProgress, pendingReceivables, people.length, pendingNotifications, firstName]);

  return (
    <div className="space-y-4">
      <SettingsHeader title="Análise" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Perfil geral de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        como você está e como melhorar.
      </p>

      {/* Score */}
      <div className="glass glass-strong relative overflow-hidden rounded-[1.8rem] p-5">
        <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-[#AF52DE]/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-36 w-36 rounded-full bg-[#5b9dff]/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-glass-sub">
              Saúde financeira
            </p>
            <Sparkles className="size-4 text-[#AF52DE]" />
          </div>
          <div className="mt-1 flex items-end gap-3">
            <p className="amount-tabular text-[46px] font-bold leading-none tracking-tight text-glass-ink">
              {score}
            </p>
            <p className="pb-1 text-[16px] font-bold text-primary">{scoreLabel}</p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/40 pt-4">
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-glass-sub">
                <TrendingUp className="size-3 text-[#1FBF4F]" />
                Receitas
              </p>
              <p className="amount-tabular mt-0.5 text-[14px] font-bold text-[#1FBF4F]">
                {formatCurrency(income)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-glass-sub">
                <TrendingDown className="size-3 text-[#FF3B30]" />
                Despesas
              </p>
              <p className="amount-tabular mt-0.5 text-[14px] font-bold text-[#FF3B30]">
                {formatCurrency(expense)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-glass-sub">
                <ArrowUpRight className="size-3 text-[#FF9500]" />
                Sobra
              </p>
              <p className="amount-tabular mt-0.5 text-[14px] font-bold text-[#FF9500]">
                {formatCurrency(Math.max(0, income - expense))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="space-y-3">
        {tips.map((tip, index) => {
          const Icon =
            tip.tone === "positive"
              ? PartyPopper
              : tip.tone === "warning"
                ? AlertTriangle
                : Lightbulb;
          return (
            <div
              key={index}
              className={cn(
                "flex items-start gap-3 rounded-3xl p-4",
                tip.tone === "positive" && "glass bg-[#1FBF4F]/5",
                tip.tone === "warning" && "glass bg-[#FF9500]/5",
                tip.tone === "info" && "glass",
              )}
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                  tip.tone === "positive" && "bg-[#1FBF4F]/15 text-[#17a443]",
                  tip.tone === "warning" && "bg-[#FF9500]/15 text-[#FF9500]",
                  tip.tone === "info" && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-glass-ink">{tip.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-glass-sub">
                  {tip.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
