import { NextResponse } from "next/server";

type Counter = { count: number; resetAt: number };

declare global {
  var __horaRateLimits: Map<string, Counter> | undefined;
}

const counters = globalThis.__horaRateLimits ?? new Map<string, Counter>();
globalThis.__horaRateLimits = counters;

function clientAddress(request: Request) {
  return request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

/**
 * Lightweight per-instance protection. Production deployments should keep the
 * platform/WAF rate limit enabled as the distributed outer layer too.
 */
export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = "",
) {
  const now = Date.now();
  if (counters.size > 5_000) {
    for (const [key, value] of counters) if (value.resetAt <= now) counters.delete(key);
  }
  const key = `${scope}:${clientAddress(request)}:${discriminator.trim().toLowerCase().slice(0, 254)}`;
  const previous = counters.get(key);
  const counter = !previous || previous.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { count: previous.count + 1, resetAt: previous.resetAt };
  counters.set(key, counter);

  if (counter.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((counter.resetAt - now) / 1_000));
  const response = NextResponse.json(
    { error: "Muitas tentativas. Aguarde um pouco e tente novamente." },
    { status: 429 },
  );
  response.headers.set("Retry-After", String(retryAfter));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
