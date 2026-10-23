import { useMemo, useState } from "react";
import { useLocalDate } from "@/hooks/use-local-date";
import { getHomeAlerts, type HomeAlert } from "@/lib/home-alerts";
import { HomeAlertCard } from "./HomeAlertCard";
import { HomeAlertsPanel } from "./HomeAlertsPanel";
import { Check, Hand, Play, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/app-store";
import {
  DEFAULT_HOME_ALERT_PREFERENCES,
  HOME_ALERT_DURATIONS,
  HOME_ALERT_INTERVALS,
  homeAlertDurationLabel,
  sanitizeHomeAlertPreferences,
  type HomeAlertPreferences,
} from "@/lib/home-alert-preferences";
import { resetProfileHomeAlerts } from "@/lib/home-alert-session";
import "./home-alert-settings.css";

export function HomeAlertSettings() {
  const {
    activeProfile,
    homeAlertPreferences,
    setHomeAlertPreferences,
    cards,
    visibleTransactions,
    loanReceivables,
    notifications,
    includeBorrowedCardInvoices,
  } = useAppStore();
  const today = useLocalDate();
  const realPreview = useMemo(
    () =>
      getHomeAlerts(
        {
          cards,
          transactions: visibleTransactions,
          loanReceivables,
          notifications,
          includeBorrowedCardInvoices,
        },
        today,
      )[0],
    [
      cards,
      visibleTransactions,
      loanReceivables,
      notifications,
      includeBorrowedCardInvoices,
      today,
    ],
  );
  const preview: HomeAlert = realPreview ?? {
    id: "appearance-preview",
    tone: "upcoming",
    label: "Vencimento próximo",
    title: "Conta de energia",
    date: today,
    amount: 149.9,
    action: "Ver transação",
    destination: { pathname: "", state: {} },
  };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] =
    useState<HomeAlertPreferences>(homeAlertPreferences);
  const update = (patch: Partial<HomeAlertPreferences>) =>
    setDraft((current) =>
      sanitizeHomeAlertPreferences({ ...current, ...patch }),
    );
  const choice = (selected: boolean) =>
    `home-alert-setting-choice ${selected ? "home-alert-setting-choice--selected" : ""}`;
  return (
    <>
      <button
        className="notification-action notification-action--restore"
        onClick={() => {
          setDraft({ ...homeAlertPreferences });
          setOpen(true);
        }}
      >
        <Settings2 className="size-4" />
        <span>Avisos da tela inicial</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="home-alert-settings home-alert-settings--live glass-strong flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-3xl bg-[#f5f8ff] p-0 text-glass-ink">
          <DialogHeader className="shrink-0 border-b border-black/10 p-5 pr-12 text-left">
            <DialogTitle>Avisos da tela inicial</DialogTitle>
            <DialogDescription className="text-glass-sub">
              Veja as mudanças na prévia enquanto ajusta. Salvar aplica ao
              seu perfil; Cancelar mantém suas preferências anteriores.
            </DialogDescription>
          </DialogHeader>
          <div className="home-alert-settings-workspace">
            <aside className="home-alert-settings-live-preview" aria-label="Prévia ao vivo dos avisos">
              <div className="home-alert-settings-preview-heading">
                <strong><span aria-hidden="true" />Prévia ao vivo</strong>
                <span>Atualiza sem salvar</span>
              </div>
              <div className="home-alert-settings-preview-content">
                {draft.enabled ? (
                  <HomeAlertsPanel preferences={draft} tone={preview.tone} total={3} preview>
                    <HomeAlertCard item={preview} preview />
                  </HomeAlertsPanel>
                ) : (
                  <div className="home-alert-setting-explainer">
                    <strong>A faixa ficará oculta no Início</strong>
                    <p>Ative Mostrar na tela inicial para visualizar os ajustes.</p>
                  </div>
                )}
              </div>
              <p className="home-alert-settings-preview-note">
                Prévia visual · não altera registros. {realPreview ? "Usa um aviso do seu perfil." : "Conteúdo ilustrativo."}
              </p>
            </aside>
            <div className="home-alert-settings-options min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5">
            <label className="home-alert-setting-toggle">
              <span>
                <strong>Mostrar na tela inicial</strong>
                <small>
                  Liga ou desliga apenas esta área do Início. O sininho e a aba
                  Notificações continuam disponíveis.
                </small>
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
            </label>
            <div className="home-alert-setting-explainer">
              <strong>Quando os avisos aparecem</strong>
              <p>
                Pagamentos e recebimentos aparecem quando estão vencidos, vencem
                hoje ou nos próximos 7 dias. Faturas respeitam o cartão e o mês;
                avisos de fechamento seguem a data de fechamento. Mensagens do
                banco para aprovação ficam identificadas como notificações para
                revisar.
              </p>
              <p>
                Marcar como lido ou visto só oculta nesta abertura. Não altera o
                saldo e não quita nada. Ao reabrir, o que ainda está pendente
                volta; o que foi efetivado não volta.
              </p>
            </div>
            <fieldset
              disabled={!draft.enabled}
              className={`space-y-5 ${!draft.enabled ? "opacity-50" : ""}`}
            >
              <div>
                <p className="home-alert-setting-title">Passagem dos avisos</p>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label="Passagem dos avisos"
                >
                  <button
                    className={choice(draft.rotation === "auto")}
                    aria-pressed={draft.rotation === "auto"}
                    onClick={() => update({ rotation: "auto" })}
                  >
                    <Play className="size-4" />
                    Automática
                  </button>
                  <button
                    className={choice(draft.rotation === "manual")}
                    aria-pressed={draft.rotation === "manual"}
                    onClick={() => update({ rotation: "manual" })}
                  >
                    <Hand className="size-4" />
                    Manual
                  </button>
                </div>
                <p className="home-alert-setting-help">
                  {draft.rotation === "auto"
                    ? "Mostra um aviso de cada vez e volta ao primeiro após o último. Pausa ao arrastar, usar o teclado na área, abrir uma confirmação ou deixar o app em segundo plano. O botão Continuar retoma a troca. Com redução de movimento, troca sem deslizar."
                    : "Não troca sozinha. Você escolhe o próximo aviso usando as setas ou deslizando para o lado. Se houver apenas um aviso, ele fica estático em qualquer modo."}
                </p>
              </div>
              {draft.rotation === "auto" && (
                <div>
                  <p className="home-alert-setting-title">
                    Tempo entre os avisos
                  </p>
                  <div
                    className="grid grid-cols-5 gap-1.5"
                    role="group"
                    aria-label="Tempo entre os avisos"
                  >
                    {HOME_ALERT_INTERVALS.map((seconds) => (
                      <button
                        key={seconds}
                        className={choice(draft.intervalSeconds === seconds)}
                        aria-pressed={draft.intervalSeconds === seconds}
                        onClick={() => update({ intervalSeconds: seconds })}
                      >
                        {seconds} s
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="home-alert-setting-help">
                Tempo entre os avisos é a duração de cada cartão antes de trocar
                para o próximo. É diferente do tempo total para a área
                desaparecer.
              </p>
              <div>
                <p className="home-alert-setting-title">
                  Quanto tempo fica na tela
                </p>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="group"
                  aria-label="Tempo de exibição"
                >
                  {HOME_ALERT_DURATIONS.map((seconds) => (
                    <button
                      key={seconds}
                      className={`${choice(draft.displaySeconds === seconds)} ${seconds === 0 ? "col-span-3" : ""}`}
                      aria-pressed={draft.displaySeconds === seconds}
                      onClick={() => update({ displaySeconds: seconds })}
                    >
                      {homeAlertDurationLabel(seconds)}
                      {draft.displaySeconds === seconds && (
                        <Check className="size-3.5 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="home-alert-setting-help">
                  {draft.displaySeconds === 0
                    ? "Não existe prazo para desaparecer. Fica até você marcar como visto nesta abertura ou efetivar o registro. Abrir o aviso só leva até ele e não o esconde."
                    : "Cada aviso tem este prazo a partir da primeira exibição nesta abertura do app. Ao acabar, ele sai do Início; avisos novos têm seu próprio prazo. Isso não paga nem recebe nada."}{" "}
                  Ao reabrir o app, pagamentos e recebimentos ainda pendentes
                  voltam, mesmo se foram marcados como lidos. Só deixam de voltar
                  depois da efetivação no registro.
                </p>
              </div>
              {draft.displaySeconds !== 0 && (
                <label className="home-alert-setting-toggle">
                  <span>
                    <strong>Ocultar depois de abrir</strong>
                    <small>
                      Ligado: ao tocar em Ver, o aviso fica oculto nesta abertura.
                      Desligado: ele continua no Início depois da consulta, até
                      terminar o prazo escolhido ou você marcar como visto.
                      Nenhuma opção efetua pagamentos; pendências voltam ao
                      reabrir o app.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.hideOnOpen}
                    onChange={(event) =>
                      update({ hideOnOpen: event.target.checked })
                    }
                  />
                </label>
              )}
              <div>
                <p className="home-alert-setting-title">Visual da área inteira</p>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label="Modelo de aparência"
                >
                  {(
                    [
                      ["glass", "Vidro", "Painel flutuante, cabeçalho e controles suaves"],
                      ["compact", "Faixa compacta", "Área horizontal, menos altura e setas na lateral"],
                      ["banner", "Destaque", "Painel todo colorido e navegação central"],
                      ["outline", "Painel lateral", "Moldura com controles e navegação na coluna lateral"],
                      [
                        "ticket",
                        "Comprovante",
                        "Área em formato de recibo, divisórias e paginação",
                      ],
                    ] as const
                  ).map(([id, label, description]) => (
                    <button
                      key={id}
                      className={`home-alert-style-choice ${draft.appearance === id ? "home-alert-style-choice--selected" : ""}`}
                      aria-pressed={draft.appearance === id}
                      onClick={() => update({ appearance: id })}
                    >
                      <span className="flex items-center justify-center gap-1 text-[12px] font-bold">
                        {label}
                        {draft.appearance === id && (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      <small>{description}</small>
                    </button>
                  ))}
                </div>
                <p className="home-alert-setting-help">
                  Cada modelo muda a área inteira: fundo, cabeçalho, posição dos
                  controles, cartão e navegação. Veja o resultado na prévia
                  antes de salvar. Os valores e a situação dos registros não mudam.
                </p>
                <div className="home-alert-customization mt-4 space-y-4">
                  <p className="home-alert-setting-title">Tamanho da faixa</p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tamanhos da faixa">
                    {([[85, "Pequena"], [100, "Padrão"], [115, "Grande"]] as const).map(([size, label]) => (
                      <button key={size} className={choice(draft.sizePercent === size)} aria-pressed={draft.sizePercent === size} onClick={() => update({ sizePercent: size })}>{label}</button>
                    ))}
                  </div>
                  <label className="home-alert-size-setting">
                    <span>Tamanho personalizado <strong>{draft.sizePercent}%</strong></span>
                    <input type="range" min="75" max="125" step="5" value={draft.sizePercent} onChange={(event) => update({ sizePercent: Number(event.target.value) })} />
                  </label>
                  <label className="home-alert-size-setting">
                    <span>Largura da faixa <strong>{draft.widthPercent}%</strong></span>
                    <input type="range" min="70" max="100" step="5" value={draft.widthPercent} onChange={(event) => update({ widthPercent: Number(event.target.value) })} />
                  </label>
                  <p className="home-alert-setting-help">O tamanho ajusta textos e espaçamento, deixando a faixa mais baixa ou mais ampla. A altura acompanha o conteúdo sem cortá-lo. A largura menor centraliza a faixa; em telas estreitas há um mínimo para manter a leitura. Os botões continuam fáceis de tocar.</p>
                  <p className="home-alert-setting-title">O que aparece na faixa</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="home-alert-setting-choice" onClick={() => update({ showPause: true, showSeen: true, showArrows: true, showPosition: true, showHeadingCount: true, showTiming: true })}>Mostrar tudo</button>
                    <button className="home-alert-setting-choice" onClick={() => update({ showPause: false, showSeen: false, showArrows: false, showPosition: false, showHeadingCount: false, showTiming: false })}>Ocultar controles e detalhes</button>
                  </div>
                  <div className="space-y-2">
                    {([
                      ["showPause", "Pausar / continuar", "Só aparece no modo automático com mais de um aviso."],
                      ["showSeen", "Marcar como visto", "Oculta o aviso nesta abertura, após confirmar. Não efetiva o pagamento."],
                      ["showArrows", "Setas de anterior e próximo", "Sem as setas, você ainda pode deslizar o aviso para os lados."],
                      ["showPosition", "Contador junto às setas", "Mostra a posição, por exemplo 03 / 14."],
                      ["showHeadingCount", "Contador no cabeçalho", "Mostra o total no alto, por exemplo 3 de 14."],
                      ["showTiming", "Texto sobre tempo de exibição", "Mostra a informação de quando os avisos somem e voltam."],
                    ] as const).map(([key, label, help]) => (
                      <label key={key} className="home-alert-setting-toggle">
                        <span><strong>{label}</strong><small>{help}</small></span>
                        <input type="checkbox" checked={draft[key]} onChange={(event) => update({ [key]: event.target.checked })} />
                      </label>
                    ))}
                  </div>
                  <p className="home-alert-setting-help">Ocultar controles muda só a aparência: a troca automática e o prazo escolhido continuam valendo. No modo manual, deslize para trocar. Sem o botão de visto, você ainda pode concluir o registro em Ver transação, fatura ou empréstimo. Você pode reativar qualquer item aqui.</p>
                </div>
              </div>
            </fieldset>
            <button
              className="notification-action notification-action--neutral"
              onClick={() => setDraft({ ...DEFAULT_HOME_ALERT_PREFERENCES })}
            >
              <RotateCcw className="size-4" />
              Restaurar padrão
            </button>
            <p className="home-alert-setting-help">
              Marcar como visto pede confirmação e só oculta o aviso nesta
              abertura. Pagar, receber ou aprovar continua sendo feito no
              registro correspondente. Salvar uma alteração reaplica a exibição
              dos avisos.
            </p>
          </div>
          </div>
          <div className="home-alert-settings-footer flex shrink-0 justify-end gap-2 border-t border-black/10 p-4">
            <button
              className="notification-action notification-action--neutral"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="notification-action notification-action--approve"
              onClick={() => {
                if (
                  JSON.stringify(draft) !== JSON.stringify(homeAlertPreferences)
                ) {
                  setHomeAlertPreferences(draft);
                  if (activeProfile) resetProfileHomeAlerts(activeProfile.id);
                }
                setOpen(false);
                toast.success("Avisos atualizados!", {
                  id: "home-alert-settings-saved",
                  duration: 1600,
                  position: "top-center",
                  style: { width: "fit-content", maxWidth: "calc(100vw - 32px)", padding: "10px 16px", borderRadius: "14px", marginInline: "auto" },
                });
              }}
            >
              Salvar preferências
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
