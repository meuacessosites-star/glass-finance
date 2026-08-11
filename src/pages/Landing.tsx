import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChartPie,
  Handshake,
  LayoutDashboard,
  Lock,
  Mic,
  ScanLine,
  Wallet,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Home,
  ArrowLeftRight,
} from "lucide-react";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { AppBackground } from "@/components/app/AppBackground";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function LogoMark({ size = "size-9" }: { size?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-white shadow-[0_8px_20px_-6px_rgba(47,107,255,0.6)]",
        size,
      )}
    >
      <Wallet className="size-[55%]" strokeWidth={2.3} />
    </div>
  );
}

function GlassPillButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-slate-900 sm:px-4 sm:py-2 sm:text-[13px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Mini phone mockup used in the hero                                   */
/* ------------------------------------------------------------------ */
function MiniPhone() {
  return (
    <div className="relative h-[500px] w-[240px] overflow-hidden rounded-[2.9rem] border-[7px] border-[#0b1220] bg-[#eef1fe] shadow-[0_50px_100px_-30px_rgba(20,50,110,0.55)] sm:h-[560px] sm:w-[268px]">
      <AppBackground />
      {/* status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-7 pt-3.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-900">
          <span>9:41</span>
          <div className="h-5 w-20 rounded-full bg-black" />
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-[#1FBF4F]" />
            <span className="font-bold text-[#1FBF4F]">92%</span>
          </span>
        </div>
      </div>

      <div className="no-scrollbar relative z-10 h-full overflow-hidden px-4 pb-6 pt-12">
        {/* greeting */}
        <div className="mt-2 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-slate-600">Bem-vinda de volta</p>
            <p className="text-[13px] font-bold text-slate-900">Olá, Marina 👋</p>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-[10px] font-bold text-white">
            MC
          </div>
        </div>

        {/* balance card */}
        <div className="glass glass-strong relative mt-3 overflow-hidden rounded-[1.6rem] p-4">
          <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#5b9dff]/25 blur-2xl" />
          <p className="text-[10px] font-medium text-slate-600">Saldo atual</p>
          <p className="amount-tabular mt-1 text-[26px] font-bold text-slate-900">
            {formatCurrency(13120.35)}
          </p>
          <div className="mt-3 flex gap-5 border-t border-white/40 pt-2.5">
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#1FBF4F]">
              <TrendingUp className="size-3" /> +{formatCurrency(8000)}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#FF3B30]">
              <TrendingDown className="size-3" /> −{formatCurrency(3279.65)}
            </span>
          </div>
        </div>

        {/* transactions */}
        <p className="mb-1 mt-4 text-[11px] font-bold text-slate-900">Transações recentes</p>
        <div className="glass divide-y divide-black/5 rounded-[1.4rem] px-3 py-1">
          {[
            { t: "iFood · Burguer", c: "#FF9F0A", v: "−R$ 67,80", g: false },
            { t: "Salário", c: "#34C759", v: "+R$ 6.800,00", g: true },
            { t: "Uber · Centro", c: "#0A84FF", v: "−R$ 24,50", g: false },
          ].map((row) => (
            <div key={row.t} className="flex items-center gap-2.5 py-2.5">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${row.c}1f` }}
              >
                <span className="size-3 rounded-full" style={{ backgroundColor: row.c }} />
              </div>
              <p className="flex-1 truncate text-[11px] font-semibold text-slate-900">{row.t}</p>
              <p className={cn("amount-tabular text-[11px] font-bold", row.g ? "text-[#1FBF4F]" : "text-slate-900")}>
                {row.v}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* mini bottom nav */}
      <div className="absolute inset-x-3 bottom-3 z-20">
        <div className="glass glass-strong flex items-center justify-between rounded-full px-3 py-2">
          <span className="flex flex-col items-center gap-0.5">
            <Home className="size-4 text-[#2F6BFF]" strokeWidth={2.4} />
            <span className="text-[7px] font-bold text-[#2F6BFF]">Início</span>
          </span>
          <span className="flex flex-col items-center gap-0.5 opacity-60">
            <ArrowLeftRight className="size-4 text-slate-500" />
            <span className="text-[7px] font-bold text-slate-500">Transações</span>
          </span>
          <span className="flex size-9 -translate-y-3 items-center justify-center rounded-full bg-gradient-to-b from-[#5b9dff] to-[#2f6bff] text-white shadow-lg ring-4 ring-white/80">
            <span className="text-lg leading-none">+</span>
          </span>
          <span className="flex flex-col items-center gap-0.5 opacity-60">
            <Handshake className="size-4 text-slate-500" />
            <span className="text-[7px] font-bold text-slate-500">Empréstimos</span>
          </span>
          <span className="flex flex-col items-center gap-0.5 opacity-60">
            <ChartPie className="size-4 text-slate-500" />
            <span className="text-[7px] font-bold text-slate-500">Relatórios</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen showcase (telas)                                              */
/* ------------------------------------------------------------------ */
type ShowcaseTab = "inicio" | "transacoes" | "emprestimos" | "relatorios";

const showcaseTabs: { id: ShowcaseTab; label: string; icon: LucideIcon }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "transacoes", label: "Transações", icon: ArrowLeftRight },
  { id: "emprestimos", label: "Empréstimos", icon: Handshake },
  { id: "relatorios", label: "Relatórios", icon: ChartPie },
];

function ShowcaseRow({
  title,
  color,
  value,
  gain,
  detail,
}: {
  title: string;
  color: string;
  value: string;
  gain?: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1f` }}
      >
        <span className="size-3.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-900">{title}</p>
        <p className="text-[10.5px] text-slate-600">{detail}</p>
      </div>
      <p className={cn("amount-tabular text-[13px] font-bold", gain ? "text-[#1FBF4F]" : "text-slate-900")}>
        {value}
      </p>
    </div>
  );
}

const showcaseRows = [
  { t: "Pão de Açúcar", c: "#FF9F0A", v: "−R$ 284,90", d: "Alimentação · 10/08" },
  { t: "Freelance · Agência", c: "#AF52DE", v: "+R$ 1.200,00", g: true, d: "Freelance · 08/08" },
  { t: "Netflix", c: "#00C7BE", v: "−R$ 55,90", d: "Assinaturas · 08/08" },
  { t: "Aluguel", c: "#5856D6", v: "−R$ 2.100,00", d: "Moradia · 03/08" },
];

function ShowcaseScreen({ tab }: { tab: ShowcaseTab }) {
  return (
    <div className="no-scrollbar h-[390px] overflow-hidden overflow-y-auto px-5 py-6 sm:h-[440px]">
      {tab === "inicio" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-600">Bem-vinda de volta</p>
              <p className="text-[16px] font-bold text-slate-900">Olá, Marina 👋</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-[11px] font-bold text-white">
              MC
            </div>
          </div>
          <div className="glass glass-strong relative overflow-hidden rounded-[1.8rem] p-4">
            <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#5b9dff]/25 blur-2xl" />
            <p className="text-[10px] font-medium text-slate-600">Saldo atual</p>
            <p className="amount-tabular mt-1 text-[30px] font-bold text-slate-900">
              {formatCurrency(13120.35)}
            </p>
            <div className="mt-3 flex gap-5 border-t border-white/40 pt-2.5">
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#1FBF4F]">
                <TrendingUp className="size-3.5" /> +{formatCurrency(8000)}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#FF3B30]">
                <TrendingDown className="size-3.5" /> −{formatCurrency(3279.65)}
              </span>
            </div>
          </div>
          <div className="glass divide-y divide-black/5 rounded-[1.6rem] px-4 py-1">
            {showcaseRows.slice(0, 3).map((row) => (
              <ShowcaseRow key={row.t} title={row.t} color={row.c} value={row.v} gain={row.g} detail={row.d} />
            ))}
          </div>
        </div>
      )}

      {tab === "transacoes" && (
        <div className="space-y-3">
          <p className="text-[17px] font-bold text-slate-900">Transações</p>
          <div className="flex gap-2">
            <span className="rounded-full bg-[#2F6BFF] px-3.5 py-1.5 text-[11px] font-bold text-white">Agosto</span>
            <span className="glass rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-slate-600">Julho</span>
          </div>
          <div className="glass divide-y divide-black/5 rounded-[1.6rem] px-4 py-1">
            {showcaseRows.map((row) => (
              <ShowcaseRow key={row.t} title={row.t} color={row.c} value={row.v} gain={row.g} detail={row.d} />
            ))}
          </div>
        </div>
      )}

      {tab === "emprestimos" && (
        <div className="space-y-3">
          <p className="text-[17px] font-bold text-slate-900">Empréstimos</p>
          <div className="glass glass-strong grid grid-cols-2 gap-3 rounded-[1.8rem] p-4">
            <div>
              <p className="text-[10px] font-medium text-slate-600">A receber</p>
              <p className="amount-tabular mt-0.5 text-[18px] font-bold text-[#1FBF4F]">R$ 150,00</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-slate-600">A pagar</p>
              <p className="amount-tabular mt-0.5 text-[18px] font-bold text-[#FF3B30]">R$ 220,00</p>
            </div>
          </div>
          <div className="glass grid grid-cols-2 gap-1 rounded-full p-1">
            <span className="rounded-full bg-[#2F6BFF] py-2 text-center text-[12px] font-bold text-white">Dinheiro</span>
            <span className="rounded-full py-2 text-center text-[12px] font-semibold text-slate-600">Cartão</span>
          </div>
          <div className="glass divide-y divide-black/5 rounded-[1.6rem] px-4 py-1">
            {[
              { n: "Marcos Silva", v: "R$ 150,00", s: "Pendente", c: "#2F6BFF" },
              { n: "Júlia Ramos", v: "R$ 80,00", s: "Pago", c: "#AF52DE" },
              { n: "Felipe Costa", v: "R$ 220,00", s: "Pendente", c: "#1FBF4F" },
            ].map((row) => (
              <div key={row.n} className="flex items-center gap-3 py-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: row.c }}
                >
                  {row.n.split(" ").map((p) => p[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{row.n}</p>
                  <p className="text-[10.5px] text-slate-600">12/07/2026</p>
                </div>
                <div className="text-right">
                  <p className="amount-tabular text-[13px] font-bold text-slate-900">{row.v}</p>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold",
                      row.s === "Pago" ? "bg-[#1FBF4F]/15 text-[#17a443]" : "bg-[#FF9500]/15 text-[#d97b00]",
                    )}
                  >
                    {row.s}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "relatorios" && (
        <div className="space-y-3">
          <p className="text-[17px] font-bold text-slate-900">Relatórios</p>
          <div className="glass rounded-[1.8rem] p-4">
            <p className="text-[12px] font-bold text-slate-900">Despesas por categoria</p>
            <div className="mt-2 flex items-center gap-5">
              <div
                className="size-28 shrink-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(#FF9F0A 0 34%, #5856D6 34% 62%, #0A84FF 62% 76%, #FF2D55 76% 87%, #00C7BE 87% 94%, #FF6482 94% 100%)",
                }}
              />
              <div className="space-y-1.5 text-[11px]">
                {[
                  ["Alimentação", "34%", "#FF9F0A"],
                  ["Moradia", "28%", "#5856D6"],
                  ["Compras", "14%", "#FF6482"],
                ].map(([label, pct, color]) => (
                  <p key={label} className="flex items-center gap-2 font-medium text-slate-600">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {label} <span className="font-bold text-slate-900">{pct}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="glass rounded-[1.6rem] p-4">
            <p className="mb-3 text-[12px] font-bold text-slate-900">Limites por categoria</p>
            <div className="space-y-3">
              {(
                [
                  ["Alimentação", 55, "#FF9F0A", "R$ 495 / 900"],
                  ["Moradia", 92, "#5856D6", "R$ 2.289 / 2.500"],
                  ["Transporte", 6, "#0A84FF", "R$ 25 / 400"],
                ] as [string, number, string, string][]
              ).map(([label, pct, color, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-900">{label}</span>
                    <span className="amount-tabular text-slate-600">{value}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function Landing() {
  const [tab, setTab] = useState<ShowcaseTab>("inicio");

  // Safe scroll-reveal: content is fully visible by default; JS only adds
  // .is-visible (which triggers a CSS entrance that ends at opacity 1) when an
  // element scrolls into view. Uses direct position checks on scroll/resize —
  // no IntersectionObserver dependency, so it works even where the observer or
  // prefers-reduced-motion would normally block it. If JS never runs, content
  // stays visible: the worst case is "no animation", never hidden text.
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (elements.length === 0) return;

    const isInViewport = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    };

    const check = () => {
      for (const el of elements) {
        if (!el.classList.contains("is-visible") && isInViewport(el)) {
          el.classList.add("is-visible");
        }
      }
    };

    // Reveal anything already on screen (covers the initial load too).
    check();

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });

    // Safety net: if no scroll/resize events fire in this environment, still
    // reveal whatever is on screen shortly after mount.
    const timer = window.setTimeout(check, 1200);

    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AppBackground />

      <div className="relative z-10">
      {/* Nav */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="glass glass-strong mx-auto flex max-w-5xl items-center justify-between rounded-full py-2 pl-3 pr-2">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[17px] font-bold tracking-tight text-slate-900">GranaScan</span>
          </div>
          <nav className="hidden items-center gap-1 text-[13.5px] font-medium text-slate-600 md:flex">
            <a href="#recursos" className="rounded-full px-3.5 py-2 transition-colors hover:text-slate-900">
              Recursos
            </a>
            <a href="#telas" className="rounded-full px-3.5 py-2 transition-colors hover:text-slate-900">
              Telas
            </a>
            <a href="#comecar" className="rounded-full px-3.5 py-2 transition-colors hover:text-slate-900">
              Começar
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="hidden rounded-full px-4 py-2 text-[13.5px] font-semibold text-slate-600 transition-colors hover:text-slate-900 sm:block"
            >
              Entrar
            </Link>
            <Link
              to="/auth"
              className="flex items-center gap-1.5 rounded-full bg-[#2F6BFF] px-3.5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(47,107,255,0.6)] transition-colors hover:brightness-105 sm:px-4"
            >
              Começar grátis
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-5 pb-10 pt-10 sm:gap-10 sm:pb-12 sm:pt-12 md:pb-20 lg:flex-row lg:gap-6 lg:pt-14">
        <div className="max-w-xl text-left sm:text-center lg:text-left">
          <span className="hero-enter hero-enter-1 glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-slate-900 sm:px-3.5 sm:text-[12.5px]">
            <Sparkles className="hidden size-3.5 text-[#2F6BFF] sm:block" />
            Leitor de notas · Comando de voz · Empréstimos
          </span>
          <h1 className="hero-enter hero-enter-2 mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 md:mt-6 md:text-6xl">
            Seu dinheiro,
            <br />
            <span className="gradient-text bg-gradient-to-r from-[#2F6BFF] via-[#5856d6] to-[#AF52DE] bg-clip-text text-transparent">
              lindo de ver.
            </span>
          </h1>
          <p className="hero-enter hero-enter-3 mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-700 md:mt-4 md:max-w-2xl md:text-lg lg:mx-0">
            Deixe a câmera ler suas notas fiscais, dite os gastos com a voz e
            acompanhe empréstimos e compras feitas no seu cartão
            <span className="hidden sm:inline"> — tudo em um app leve, claro e elegante, feito para o seu celular.</span>
          </p>
          <div className="hero-enter hero-enter-4 mt-6 flex flex-col items-center gap-3 sm:mt-8 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              to="/auth"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#2F6BFF] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_14px_34px_-10px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 sm:w-auto sm:px-7 sm:py-3.5 sm:text-[15px]"
            >
              Começar agora
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#telas"
              className="glass glass-strong flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-slate-900 transition-colors hover:brightness-105 sm:w-auto sm:px-7 sm:py-3.5 sm:text-[15px]"
            >
              Ver as telas
            </a>
          </div>
          <div className="hero-enter hero-enter-5 mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:mt-7 lg:justify-start">
            <GlassPillButton>Leitor de notas fiscais</GlassPillButton>
            <GlassPillButton>Comando de voz</GlassPillButton>
            <GlassPillButton>Modo claro e escuro</GlassPillButton>
          </div>
        </div>

        <div className="hero-enter-phone relative -mt-5 shrink-0 sm:mt-0">
          <div className="absolute -inset-10 -z-10 rounded-full bg-gradient-to-br from-[#5b9dff]/40 to-[#AF52DE]/30 blur-3xl" />
          <div className="relative animate-[float_7s_ease-in-out_infinite]">
            <MiniPhone />
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-12 sm:py-16 md:py-20">
        <div className="reveal mx-auto max-w-2xl text-left sm:text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-slate-900">Recursos</p>
          <h2 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[40px]">
            Tudo que sua vida financeira precisa
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-slate-600 sm:text-[15.5px]">
            Da nota fiscal escaneada ao resumo do mês: uma experiência
            construída para o celular, com a elegância dos apps nativos.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-3">
          {[
            {
              icon: ScanLine,
              color: "#1FBF4F",
              title: "Leitor de notas fiscais",
              desc: "Fotografe o cupom e deixe que o GranaScan leia o valor e a data. Chega de digitar gasto por gasto.",
            },
            {
              icon: Mic,
              color: "#AF52DE",
              title: "Comando de voz",
              desc: "Dite o gasto do jeito que você fala — “almoço, quarenta e cinco reais” — e ele vira uma transação na hora.",
            },
            {
              icon: Handshake,
              color: "#FF9500",
              title: "Empréstimos & cartões",
              desc: "Controle quem te deve, para quem você deve e as compras parceladas que terceiros fizeram no seu cartão — com status Pago ou Pendente.",
            },
            {
              icon: LayoutDashboard,
              color: "#2F6BFF",
              title: "Dashboard elegante",
              desc: "Saldo atual, receitas e despesas do mês em um resumo claro, com transações recentes sempre à mão e filtros por mês e categoria.",
            },
            {
              icon: ChartPie,
              color: "#5856D6",
              title: "Relatórios e metas",
              desc: "Gráficos simples de despesas e limites por categoria para entender para onde o dinheiro vai — e gastar com consciência.",
            },
            {
              icon: Lock,
              color: "#00C7BE",
              title: "Privado, só para você",
              desc: "Um app feito para uso pessoal: seu dinheiro, suas contas e nenhuma complicação de time ou workspace.",
            },
          ].map((feature, index) => (
            <div
              key={feature.title}
              className="reveal glass glass-strong rounded-[2rem] p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(index, 5) * 0.06}s` }}
            >
              <div
                className="flex size-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${feature.color}1f` }}
              >
                <feature.icon className="size-6" style={{ color: feature.color }} strokeWidth={2.2} />
              </div>
              <h3 className="mt-5 text-[19px] font-bold tracking-tight text-slate-900">{feature.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-slate-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Telas (interactive showcase) */}
      <section id="telas" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-12 sm:py-16 md:py-20">
        <div className="reveal mx-auto max-w-2xl text-left sm:text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-slate-900">As telas</p>
          <h2 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[40px]">
            Navegue pelos menus
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-slate-600 sm:text-[15.5px]">
            A barra inferior leva você a todas as áreas do app. Experimente as
            abas abaixo.
          </p>
        </div>

        <div className="reveal mx-auto mt-10 max-w-3xl sm:mt-12">
          <div className="glass glass-strong overflow-hidden rounded-[2.4rem] p-2 sm:p-2.5">
            {/* tab pills */}
            <div className="glass glass-soft flex gap-1.5 rounded-full p-1.5">
              {showcaseTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10.5px] font-semibold transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:py-2.5 sm:text-[12.5px]",
                    tab === item.id ? "text-white" : "text-slate-600",
                  )}
                >
                  {tab === item.id && (
                    <span className="absolute inset-0 rounded-full bg-[#2F6BFF] shadow-[0_8px_20px_-6px_rgba(47,107,255,0.6)]" />
                  )}
                  <item.icon className="relative z-10 size-4" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              ))}
            </div>

            {/* screen preview */}
            <div className="relative mt-2.5 h-[400px] overflow-hidden rounded-[1.8rem] bg-[#eef1fe] sm:h-[450px]">
              <AppBackground />
              <div className="relative z-10">
                <ShowcaseScreen tab={tab} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="comecar" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-12 sm:py-16 md:py-20">
        <div className="reveal glass glass-strong relative overflow-hidden rounded-[2.6rem] px-5 py-12 text-center sm:px-16 sm:py-16">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#5b9dff]/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#AF52DE]/25 blur-3xl" />
          <div className="relative">
            <LogoMark size="size-14" />
            <h2 className="mx-auto mt-6 max-w-xl text-[26px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[40px]">
              Pronto para colocar suas finanças no controle?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
              Crie sua conta grátis e explore o GranaScan com dados de
              demonstração em segundos.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#2F6BFF] px-8 py-4 text-[15px] font-semibold text-white shadow-[0_14px_34px_-10px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 sm:w-auto"
              >
                Começar grátis
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/auth"
                className="glass glass-strong flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-[15px] font-semibold text-slate-900 transition-colors hover:brightness-105 sm:w-auto"
              >
                Entrar na minha conta
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 pb-10 pt-4">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 border-t border-white/40 pt-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <LogoMark size="size-7" />
            <span className="text-[14px] font-bold text-slate-900">GranaScan</span>
            <span className="text-[12.5px] text-slate-500">· Finanças pessoais</span>
          </div>
          <p className="text-[12.5px] text-slate-600">
            Feito com <span className="text-[#FF3B30]">♥</span> · Interface de demonstração
          </p>
          <div className="flex items-center gap-4 text-[12.5px] font-medium text-slate-600">
            <a href="#recursos" className="transition-colors hover:text-slate-900">Recursos</a>
            <a href="#telas" className="transition-colors hover:text-slate-900">Telas</a>
            <Link to="/auth" className="transition-colors hover:text-slate-900">Entrar</Link>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
