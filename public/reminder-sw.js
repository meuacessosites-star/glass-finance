/* Handle encrypted push notifications delivered by the browser's Push Service.
 * The payload never contains names, amounts or sensitive financial details.
 */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title.slice(0, 50) : "Glass Finance";
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "Você tem lembretes financeiros para conferir.";
  const url = "/dashboard/notificacoes";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/favicon.png", badge: "/favicon.png",
    tag: "glass-finance-push-daily",
    data: { url },
  }));
});

/* This worker displays user-authorized alerts from the foreground app.
 * It does not pretend to deliver background web push without a server.
 */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL("/dashboard/notificacoes", self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
