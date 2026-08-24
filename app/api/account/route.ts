import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, toSafeUser } from "@/lib/auth";
import { databaseErrorResponse, isSameOriginRequest, forbidden, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import type { RoundingMode } from "@/lib/reporting";

export async function PATCH(request: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const name = String(body.name ?? current.name).trim().slice(0, 80);
    const goalHours = Math.round(Number(body.goalHours ?? current.goalHours));
    const annualGoalHours = Math.round(Number(body.annualGoalHours ?? current.annualGoalHours));
    const roundingMode = String(body.roundingMode ?? current.roundingMode) as RoundingMode;
    if (name.length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    if (!Number.isInteger(goalHours) || goalHours < 1 || goalHours > 200) {
      return NextResponse.json({ error: "A meta deve estar entre 1 e 200 horas." }, { status: 400 });
    }
    if (!Number.isInteger(annualGoalHours) || annualGoalHours < 1 || annualGoalHours > 2400) {
      return NextResponse.json({ error: "A meta anual deve estar entre 1 e 2.400 horas." }, { status: 400 });
    }
    if (!["none", "nearest", "up", "down"].includes(roundingMode)) {
      return NextResponse.json({ error: "Selecione uma regra de arredondamento válida." }, { status: 400 });
    }
    const updated = await getDb()
      .update(users)
      .set({ name, goalHours, annualGoalHours, roundingMode, updatedAt: new Date() })
      .where(eq(users.id, current.id))
      .returning();
    if (!updated[0]) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    const response = NextResponse.json({ user: toSafeUser(updated[0], current.sessionExpiresAt ? new Date(current.sessionExpiresAt) : null) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return databaseErrorResponse(error, "Não foi possível salvar seu perfil.");
  }
}
