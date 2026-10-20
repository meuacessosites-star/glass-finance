import { useState } from "react";
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
  const { activeProfile, homeAlertPreferences, setHomeAlertPreferences } =
    useAppStore();
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
        Avisos da tela inicial
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="home-alert-settings glass-strong flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-3xl bg-[#f5f8ff] p-0 text-glass-ink">
          <DialogHeader className="shrink-0 border-b border-black/10 p-5 pr-12 text-left">
            <DialogTitle>Avisos da tela inicial</DialogTitle>
            <DialogDescription className="text-glass-sub">
              Escolha como os avisos aparecem. As preferências ficam salvas
              neste perfil.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5">
            <label className="home-alert-setting-toggle">
              <span>
                <strong>Mostrar na tela inicial</strong>
                <small>
                  Notificações, pagamentos e recebimentos pendentes.
                </small>
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
            </label>
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
                    ? "Troca sozinha, com pausa ao tocar, passar o mouse ou usar o teclado. As setas continuam disponíveis."
                    : "Só muda quando você usa as setas ou desliza para o lado."}
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
                    ? "Fica visível até você marcar como visto ou concluir o registro. Abrir o aviso apenas leva até ele, sem esconder."
                    : "O prazo conta a partir da primeira exibição nesta abertura do app. Ao acabar, o aviso sai da tela inicial."}{" "}
                  Pendências podem voltar ao reabrir; itens concluídos não
                  voltam.
                </p>
              </div>
              {draft.displaySeconds !== 0 && (
                <label className="home-alert-setting-toggle">
                  <span>
                    <strong>Ocultar depois de abrir</strong>
                    <small>
                      Ao tocar em Ver, o aviso sai desta abertura. Isso não
                      efetua pagamentos.
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
                <p className="home-alert-setting-title">Modelo de aparência</p>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="group"
                  aria-label="Modelo de aparência"
                >
                  {(
                    [
                      ["glass", "Vidro", "Cores suaves"],
                      ["compact", "Compacto", "Menos espaço"],
                      ["banner", "Destaque", "Faixa colorida"],
                    ] as const
                  ).map(([id, label, description]) => (
                    <button
                      key={id}
                      className={`home-alert-style-choice ${draft.appearance === id ? "home-alert-style-choice--selected" : ""}`}
                      aria-pressed={draft.appearance === id}
                      onClick={() => update({ appearance: id })}
                    >
                      <span
                        className={`home-alert-style-preview home-alert-style-preview--${id}`}
                        aria-hidden="true"
                      >
                        <i />
                        <span>
                          <b />
                          <b />
                          <b />
                        </span>
                      </span>
                      <span className="mt-2 flex items-center justify-center gap-1 text-[12px] font-bold">
                        {label}
                        {draft.appearance === id && (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      <small>{description}</small>
                    </button>
                  ))}
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
          <div className="flex shrink-0 justify-end gap-2 border-t border-black/10 p-4">
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
                toast("Preferências dos avisos salvas");
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
