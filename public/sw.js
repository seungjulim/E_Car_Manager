/* E-car-manage 서비스 워커: 푸시 알림을 받아 보여 주고, 누르면 해당 화면을 연다. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** 앱 안의 경로("/cars/...")만 허용한다. "//evil.com" 같은 프로토콜 상대 주소와 "/\\evil.com" 도 거부 */
function safePath(url) {
  return typeof url === "string" && /^\/(?![/\\])/.test(url) ? url : "/cars";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "E-car-manage", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "E-car-manage";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined, // 같은 알림이 겹치지 않게
      data: { url: safePath(data.url) },
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        // 이미 열린 앱 창이 있으면 그 창을 해당 화면으로 보낸다
        if ("focus" in w && new URL(w.url).origin === self.location.origin) {
          w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
