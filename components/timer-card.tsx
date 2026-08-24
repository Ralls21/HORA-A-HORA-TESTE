"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePause, CirclePlay, RotateCcw, Square, Timer } from "lucide-react";
import { EMPTY_TIMER, parseStoredTimer, timerElapsed, timerMinutes, type StoredTimer } from "@/lib/timer";

export type TimerCategory = "service" | "ldc";

function clockLabel(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function syncTimerNotification(timer: StoredTimer, elapsedMs: number) {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({
      type: "HORA_TIMER_NOTIFICATION",
      timer: { category: timer.category, running: timer.running, elapsedMs },
    });
  }).catch(() => undefined);
}

function closeTimerNotification() {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "HORA_TIMER_NOTIFICATION_CLOSE" });
  }).catch(() => undefined);
}

export function TimerCard({ userId, onFinish }: { userId: number; onFinish: (category: TimerCategory, minutes: number) => Promise<void> }) {
  const storageKey = `hora-a-hora-timer-${userId}`;
  const [timer, setTimer] = useState<StoredTimer>(EMPTY_TIMER);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const timerActionRef = useRef<(action: string) => void>(() => undefined);
  const lastNotificationTick = useRef(-1);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const timestamp = Date.now();
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(storageKey); } catch { /* O cronômetro continua em memória. */ }
      setTimer(parseStoredTimer(saved, timestamp));
      setNow(timestamp);
      setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(timer)); } catch { /* O cronômetro continua em memória. */ }
  }, [hydrated, storageKey, timer]);

  useEffect(() => {
    if (!timer.running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.running]);

  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => setNow(Date.now());
    const syncFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const timestamp = Date.now();
      setTimer(parseStoredTimer(event.newValue, timestamp));
      setNow(timestamp);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", syncFromAnotherTab);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", syncFromAnotherTab);
    };
  }, [hydrated, storageKey]);

  const elapsedMs = useMemo(() => timerElapsed(timer, now), [now, timer]);

  function startOrResume() {
    if (!hydrated || finishing) return;
    const timestamp = Date.now();
    setNow(timestamp);
    setTimer((current) => ({ ...current, running: true, startedAt: timestamp }));
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    try {
      const request = Notification.requestPermission() as Promise<NotificationPermission> | undefined;
      const permission = request ? await request : Notification.permission;
      setNotificationPermission(permission);
    } catch {
      setNotificationPermission(Notification.permission);
    }
  }

  function pause() {
    if (finishing) return;
    const timestamp = Date.now();
    setNow(timestamp);
    setTimer((current) => ({ ...current, running: false, startedAt: null, accumulatedMs: timerElapsed(current, timestamp) }));
  }

  function reset() {
    if (elapsedMs > 0 && !window.confirm("Zerar o cronômetro atual?")) return;
    setTimer((current) => ({ ...EMPTY_TIMER, category: current.category }));
    setNow(Date.now());
    closeTimerNotification();
  }

  async function finish(skipConfirmation = false) {
    if (finishing) return;
    const timestamp = Date.now();
    const finalElapsedMs = timerElapsed(timer, timestamp);
    const minutes = timerMinutes(finalElapsedMs);
    if (!finalElapsedMs || (!skipConfirmation && !window.confirm(`Finalizar e registrar ${minutes} minuto${minutes === 1 ? "" : "s"}?`))) return;
    // Congela o valor exato do clique para não descartar segundos enquanto a API responde.
    setTimer((current) => ({ ...current, running: false, startedAt: null, accumulatedMs: timerElapsed(current, timestamp) }));
    setNow(timestamp);
    setFinishing(true);
    try {
      await onFinish(timer.category, minutes);
      setTimer((current) => ({ ...EMPTY_TIMER, category: current.category }));
      setNow(Date.now());
      closeTimerNotification();
    } catch {
      // The parent explains the error. Keep the timer intact so no measured time is lost.
    } finally {
      setFinishing(false);
    }
  }

  useEffect(() => {
    timerActionRef.current = (action: string) => {
      if (action === "pause") pause();
      if (action === "resume") startOrResume();
      if (action === "stop") void finish(true);
    };
  });

  useEffect(() => {
    if (!hydrated) return;
    const seconds = Math.floor(elapsedMs / 1000);
    if (!elapsedMs) {
      closeTimerNotification();
      lastNotificationTick.current = -1;
      return;
    }
    // Atualiza imediatamente e depois a cada 15 segundos para poupar bateria.
    if (!timer.running || seconds < 2 || seconds % 15 === 0) {
      if (lastNotificationTick.current !== seconds || !timer.running) {
        syncTimerNotification(timer, elapsedMs);
        lastNotificationTick.current = seconds;
      }
    }
  }, [elapsedMs, hydrated, timer]);

  useEffect(() => {
    if (!hydrated || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "HORA_TIMER_ACTION") timerActionRef.current(String(event.data.action ?? ""));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    const url = new URL(window.location.href);
    const requestedAction = url.searchParams.get("timerAction");
    if (requestedAction) {
      url.searchParams.delete("timerAction");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.setTimeout(() => timerActionRef.current(requestedAction), 0);
    }
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [hydrated]);

  return (
    <section className={`timer-card ${timer.running ? "running" : ""}`} aria-label="Cronômetro de serviço">
      <div className="timer-card-heading">
        <span className="timer-icon"><Timer size={22} /></span>
        <div><span className="card-label">Cronômetro</span><strong>{timer.running ? "Contagem em andamento" : elapsedMs ? "Contagem pausada" : "Pronto para começar"}</strong></div>
      </div>
      <div className="timer-category" aria-label="Categoria do cronômetro">
        <button type="button" className={timer.category === "service" ? "selected" : ""} disabled={!hydrated || finishing || timer.running || elapsedMs > 0} onClick={() => setTimer((current) => ({ ...current, category: "service" }))}>Serviço</button>
        <button type="button" className={timer.category === "ldc" ? "selected" : ""} disabled={!hydrated || finishing || timer.running || elapsedMs > 0} onClick={() => setTimer((current) => ({ ...current, category: "ldc" }))}>LDC</button>
      </div>
      <output className="timer-display" aria-live="off">{clockLabel(elapsedMs)}</output>
      <div className="timer-actions">
        {timer.running ? (
          <button type="button" className="button secondary" disabled={finishing} onClick={pause}><CirclePause size={18} /> Pausar</button>
        ) : (
          <button type="button" className="button primary" disabled={!hydrated || finishing} onClick={startOrResume}><CirclePlay size={18} /> {!hydrated ? "Carregando…" : elapsedMs ? "Continuar" : "Iniciar"}</button>
        )}
        <button type="button" className="button secondary" disabled={!elapsedMs || finishing} onClick={() => void finish()}><Square size={17} /> {finishing ? "Salvando…" : "Finalizar"}</button>
        <button type="button" className="timer-reset" aria-label="Zerar cronômetro" disabled={!elapsedMs || finishing} onClick={reset}><RotateCcw size={17} /></button>
      </div>
      <small>
        {!hydrated ? "Recuperando o cronômetro salvo…" : notificationPermission === "default" ? (
          <>O cronômetro já funciona. <button type="button" className="timer-notification-button" onClick={() => void enableNotifications()}>Ativar notificações</button> é opcional.</>
        ) : notificationPermission === "granted" ? "Notificações ativas, com ações para pausar e parar." : "O cronômetro funciona normalmente sem notificações."}
      </small>
    </section>
  );
}
