import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";

export function BrowserReminderSettings() {
  const { reminderPreferences, setReminderPreferences, activeProfile } = useAppStore();
  const publicKey = useQuery(api.pushNotifications.getPublicKey, {});
  const registerDevice = useMutation(api.pushNotifications.registerDevice);
  const removeDevice = useMutation(api.pushNotifications.removeDevice);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  const permission = supported ? Notification.permission : "unsupported";
  const enabled = reminderPreferences.browserEnabled && permission === "granted";
  const pushReady = Boolean(publicKey);

  const toggle = async () => {
    if (busy) return;
    if (reminderPreferences.browserEnabled) {
      setBusy(true);
      try {
        const worker = await navigator.serviceWorker.getRegistration("/");
        const sub = await worker?.pushManager.getSubscription();
        if (sub) {
          await removeDevice({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setReminderPreferences({ ...reminderPreferences, browserEnabled: false });
        toast.success("Notificações push desativadas neste aparelho");
      } catch {
        toast.error("Não foi possível remover a inscrição. Tente novamente.");
      } finally { setBusy(false); }
      return;
    }
    if (!supported || !("PushManager" in window) || !pushReady || !activeProfile) {
      toast.error(pushReady ? "Este navegador não permite notificações push. Tente instalar o aplicativo na tela inicial." : "O servidor push ainda não foi configurado.");
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
      const worker = await navigator.serviceWorker.register("/reminder-sw.js", { scope: "/" });
      const existing = await worker.pushManager.getSubscription();
      const decoded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const pad = decoded + "=".repeat((4 - decoded.length % 4) % 4);
      const binary = atob(pad);
      const applicationServerKey = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) applicationServerKey[i] = binary.charCodeAt(i);
      const subscription = existing ?? await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const details = subscription.toJSON();
      if (!details.keys?.p256dh || !details.keys.auth) throw new Error("Chaves push ausentes");
      const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await registerDevice({
        profileId: activeProfile.id,
        endpoint: subscription.endpoint,
        p256dh: details.keys.p256dh,
        auth: details.keys.auth,
        timeZone: deviceTimeZone,
      });
      setReminderPreferences({ ...reminderPreferences, browserEnabled: true });
      toast.success("Push ativado neste aparelho", {
        description: "O Convex poderá enviar lembretes mesmo com o aplicativo fechado, se o navegador permitir.",
      });
    } catch {
      toast.error("Não foi possível ativar os lembretes neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  const testAlert = async () => {
    if (!enabled || !supported) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) throw new Error("Sem permissão de notificação");
      await registration.showNotification("Teste do Glass Finance", {
        body: "Os lembretes estão autorizados neste navegador. Nenhum valor financeiro é mostrado na tela bloqueada.",
        icon: "/favicon.png",
        tag: "glass-finance-test",
        data: { url: "/dashboard/notificacoes" },
      });
      toast.success("Notificação de teste enviada ao aparelho");
    } catch {
      toast.error("O navegador não conseguiu apresentar o teste de notificação.");
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
      {enabled && (
        <button type="button" onClick={() => void testAlert()}
          className="rounded-xl px-3 py-2 text-[12px] font-semibold text-primary underline underline-offset-2">
          Enviar notificação de teste
        </button>
      )}
      <p className="max-w-[290px] text-[11px] leading-relaxed text-glass-sub">
        {permission === "denied"
          ? "O navegador bloqueou avisos. Libere a permissão nas configurações do site."
          : !supported
            ? "Notificações não disponíveis neste navegador."
            : !pushReady
              ? "Push indisponível: configure as chaves VAPID no Convex e recarregue."
              : "Push diário às 9h no fuso do aparelho, inclusive com o app fechado quando o navegador permitir."}
      </p>
    </div>
  );
}
