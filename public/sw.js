const CACHE = "hora-a-hora-v16";
const SETTINGS_CACHE = "hora-a-hora-settings-v2";
const REMINDER_URL = "/__hora-a-hora-reminder";
const STUDY_SCHEDULE_URL = "/__hora-a-hora-study-schedules";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const TIMER_NOTIFICATION_TAG = "hora-a-hora-running-timer";

function timerLabel(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

async function showTimerNotification(timer) {
  const category = timer.category === "ldc" ? "LDC" : "Serviço";
  await self.registration.showNotification(`Cronômetro · ${category}`, {
    body: `${timer.running ? "Em andamento" : "Pausado"} · ${timerLabel(timer.elapsedMs)}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: TIMER_NOTIFICATION_TAG,
    renotify: false,
    requireInteraction: true,
    silent: true,
    data: { timerNotification: true },
    actions: [
      { action: timer.running ? "pause" : "resume", title: timer.running ? "Pausar" : "Continuar" },
      { action: "stop", title: "Parar e salvar" },
    ],
  });
}

async function closeTimerNotifications() {
  const notifications = await self.registration.getNotifications({ tag: TIMER_NOTIFICATION_TAG });
  notifications.forEach((notification) => notification.close());
}

async function readReminder() {
  const response = await (await caches.open(SETTINGS_CACHE)).match(REMINDER_URL);
  return response ? response.json() : { enabled: false, days: 3, lastNotice: null };
}

async function saveReminder(preferences) {
  const cache = await caches.open(SETTINGS_CACHE);
  const current = await readReminder();
  await cache.put(REMINDER_URL, new Response(JSON.stringify({ ...current, ...preferences }), {
    headers: { "Content-Type": "application/json" },
  }));
}

async function readStudySchedules() {
  const response = await (await caches.open(SETTINGS_CACHE)).match(STUDY_SCHEDULE_URL);
  return response ? response.json() : { studies: [], sent: {} };
}

async function saveStudySchedules(studies, userId) {
  const cache = await caches.open(SETTINGS_CACHE);
  const current = await readStudySchedules();
  const sent = current.userId === userId ? current.sent || {} : {};
  await cache.put(STUDY_SCHEDULE_URL, new Response(JSON.stringify({ userId, studies, sent }), { headers: { "Content-Type": "application/json" } }));
}

async function checkStudyReminders() {
  if (Notification.permission !== "granted") return;
  const config = await readStudySchedules();
  const now = new Date();
  const currentDate = localDate();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayId = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
  config.sent = Object.fromEntries(Object.entries(config.sent || {}).filter(([key]) => key.includes(currentDate)));
  let changed = false;
  for (const study of config.studies || []) {
    if (!study.active || !study.remindersEnabled || !study.preferredTime) continue;
    const [hour, minute] = study.preferredTime.split(":").map(Number);
    const difference = currentMinutes - (hour * 60 + minute);
    const scheduledToday = study.nextMeetingOn === currentDate || (study.recurrence === "weekly" && (study.preferredDays || []).includes(dayId));
    const key = `${study.id}-${currentDate}-${study.preferredTime}`;
    if (!scheduledToday || difference < 0 || difference > 60 || config.sent?.[key]) continue;
    await self.registration.showNotification(`Estudo com ${study.name}`, {
      body: `${study.preferredTime}${study.address ? ` · ${study.address}` : ""}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `hora-a-hora-study-${key}`,
      data: { studyReminder: true, url: `/estudantes/${study.id}` },
      actions: [{ action: "open-study", title: "Abrir estudante" }],
    });
    config.sent[key] = new Date().toISOString();
    changed = true;
  }
  if (changed) {
    const cache = await caches.open(SETTINGS_CACHE);
    await cache.put(STUDY_SCHEDULE_URL, new Response(JSON.stringify(config), { headers: { "Content-Type": "application/json" } }));
  }
}

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

async function checkReminder() {
  const preferences = await readReminder();
  if (!preferences.enabled || Notification.permission !== "granted") return;
  const response = await fetch(`/api/records?latest=1&through=${localDate()}`, { credentials: "include" });
  if (!response.ok) return;
  const data = await response.json();
  const records = Array.isArray(data.records) ? data.records : [];
  const latest = records[0]?.date || null;
  if (!latest && !preferences.createdAt) return;
  const current = new Date(`${localDate()}T12:00:00`);
  const reference = latest ? new Date(`${latest}T12:00:00`) : new Date(preferences.createdAt);
  const days = Math.floor((current.getTime() - reference.getTime()) / 86_400_000);
  if (days < preferences.days || preferences.lastNotice === localDate()) return;
  await self.registration.showNotification("Hora a Hora", {
    body: `Você está há ${days} dias sem registrar suas horas. Toque para preencher agora.`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "hora-a-hora-reminder",
  });
  await saveReminder({ lastNotice: localDate() });
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== SETTINGS_CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "HORA_REMINDER_CONFIG") {
    event.waitUntil(saveReminder({ ...event.data.preferences, userId: event.data.userId, createdAt: event.data.createdAt }));
  }
  if (event.data?.type === "HORA_TIMER_NOTIFICATION") {
    event.waitUntil(showTimerNotification(event.data.timer));
  }
  if (event.data?.type === "HORA_TIMER_NOTIFICATION_CLOSE") {
    event.waitUntil(closeTimerNotifications());
  }
  if (event.data?.type === "HORA_STUDY_SCHEDULES") {
    event.waitUntil(saveStudySchedules(event.data.studies || [], event.data.userId));
  }
  if (event.data?.type === "HORA_CLEAR_PRIVATE_DATA") {
    event.waitUntil((async () => {
      const cache = await caches.open(SETTINGS_CACHE);
      await Promise.all([cache.delete(REMINDER_URL), cache.delete(STUDY_SCHEDULE_URL), closeTimerNotifications()]);
      const notifications = await self.registration.getNotifications();
      notifications.forEach((notification) => {
        if (notification.tag?.startsWith("hora-a-hora")) notification.close();
      });
    })());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "hora-a-hora-reminder") event.waitUntil(checkReminder());
  if (event.tag === "hora-a-hora-study-reminders") event.waitUntil(checkStudyReminders());
});

self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.timerNotification) {
    const action = event.action || "open";
    if (action === "stop") event.notification.close();
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
        const existing = clients.find((client) => "focus" in client);
        if (existing) {
          if (action === "open") return existing.focus();
          const currentUrl = new URL(existing.url);
          if (currentUrl.pathname === "/") {
            existing.postMessage({ type: "HORA_TIMER_ACTION", action });
            return existing.focus();
          }
          return existing.navigate(`/?timerAction=${encodeURIComponent(action)}`).then((client) => client?.focus());
        }
        const parameter = action === "open" ? "" : `?timerAction=${encodeURIComponent(action)}`;
        return self.clients.openWindow(`/${parameter}`);
      })
    );
    return;
  }
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing) existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    const safeToCacheNavigation = !url.searchParams.has("reset");
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && safeToCacheNavigation) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Scripts, estilos, fontes e imagens já visitados ficam disponíveis sem conexão.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    }))
  );
});
