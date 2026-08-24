export type StoredTimer = {
  category: "service" | "ldc";
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
};

export const EMPTY_TIMER: StoredTimer = {
  category: "service",
  running: false,
  startedAt: null,
  accumulatedMs: 0,
};

export function timerElapsed(timer: StoredTimer, now: number) {
  const activeElapsed = timer.running && timer.startedAt !== null
    ? Math.max(0, now - timer.startedAt)
    : 0;
  return Math.max(0, timer.accumulatedMs + activeElapsed);
}

export function timerMinutes(milliseconds: number) {
  return Math.max(1, Math.round(Math.max(0, milliseconds) / 60_000));
}

export function parseStoredTimer(value: string | null, now = Date.now()): StoredTimer {
  if (!value) return { ...EMPTY_TIMER };
  try {
    const parsed = JSON.parse(value) as Partial<StoredTimer> | null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_TIMER };
    const category = parsed.category === "ldc" ? "ldc" : "service";
    const accumulatedMs = typeof parsed.accumulatedMs === "number" && Number.isFinite(parsed.accumulatedMs)
      ? Math.max(0, parsed.accumulatedMs)
      : 0;
    const savedStartedAt = typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt) && parsed.startedAt > 0
      ? parsed.startedAt
      : null;
    const running = parsed.running === true && savedStartedAt !== null;
    return {
      category,
      running,
      // Mudanças no relógio do aparelho não podem produzir tempo negativo.
      startedAt: running ? Math.min(savedStartedAt, now) : null,
      accumulatedMs,
    };
  } catch {
    return { ...EMPTY_TIMER };
  }
}
