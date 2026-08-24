import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { databaseErrorResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const limited = checkRateLimit(request, "health", 60, 60_000);
    if (limited) return limited;
    const db = getDb();
    const check = await db.execute(sql`
      select (
        to_regclass('public.users') is not null and
        to_regclass('public.sessions') is not null and
        to_regclass('public.password_resets') is not null and
        to_regclass('public.records') is not null and
        to_regclass('public.studies_registry') is not null and
        to_regclass('public.study_events') is not null
      ) as ready
    `);
    const ready = Boolean((check as unknown as { rows?: Array<{ ready?: boolean }> }).rows?.[0]?.ready);
    if (!ready) throw new Error("Uma ou mais tabelas obrigatórias não existem.");
    const response = NextResponse.json({
      ok: true,
      service: "hora-a-hora",
      database: "connected",
      schema: "ready",
      time: new Date().toISOString(),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "O banco de dados não passou na verificação de integridade.");
  }
}
