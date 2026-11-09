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
