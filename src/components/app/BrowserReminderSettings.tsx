import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";

export function BrowserReminderSettings() {
  const { reminderPreferences, setReminderPreferences } = useAppStore();
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  const permission = supported ? Notification.permission : "unsupported";
  const enabled = reminderPreferences.browserEnabled && permission === "granted";

  const toggle = async () => {
    if (busy) return;
    if (reminderPreferences.browserEnabled) {
      setReminderPreferences({ ...reminderPreferences, browserEnabled: false });
      toast("Alertas do navegador desativados para este perfil");
      return;
    }
    if (!supported) {
      toast.error("Este navegador não permite notificações. Em alguns celulares, é necessário instalar o app na tela inicial.");
      return;
    }
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        setReminderPreferences({ ...reminderPreferences, browserEnabled: false });
        toast.error("Permissão não concedida. Autorize as notificações nas configurações do navegador.");
        return;
      }
      await navigator.serviceWorker.register("/reminder-sw.js", { scope: "/" });
      setReminderPreferences({ ...reminderPreferences, browserEnabled: true });
      toast.success("Lembretes ativados neste navegador", {
        description: "Avisos aparecem ao abrir ou usar o aplicativo. Envio com o app fechado depende de notificações push.",
      });
    } catch {
      toast.error("Não foi possível ativar os lembretes neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <button type="button" disabled={busy}
        className="notification-action notification-action--restore"
        aria-pressed={enabled}
        onClick={() => void toggle()}>
        {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        {busy ? "Ativando…" : enabled ? "Desativar alertas" : "Ativar lembretes"}
      </button>
      <p className="max-w-[290px] text-[11px] leading-relaxed text-glass-sub">
        {permission === "denied"
          ? "O navegador bloqueou avisos. Libere a permissão nas configurações do site."
          : !supported
            ? "Notificações não disponíveis neste navegador."
            : "Receba lembretes no aparelho quando usar ou reabrir o app. Com o app fechado, o envio depende de push."}
      </p>
    </div>
  );
}
