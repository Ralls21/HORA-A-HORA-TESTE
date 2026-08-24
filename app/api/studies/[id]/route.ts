import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { studiesRegistry } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { parseStudyInput } from "@/lib/studies";

type RouteContext = { params: Promise<{ id: string }> };

function formatStudy<T extends { createdAt: Date; updatedAt: Date }>(study: T) {
  return { ...study, createdAt: study.createdAt.toISOString(), updatedAt: study.updatedAt.toISOString() };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Estudo inválido." }, { status: 400 });
    const db = getDb();
    const current = await db.select().from(studiesRegistry).where(and(eq(studiesRegistry.id, id), eq(studiesRegistry.userId, user.id))).limit(1);
    if (!current[0]) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });
    const values = parseStudyInput(await readJson(request), current[0]);
    const updated = await db.update(studiesRegistry).set(values).where(and(eq(studiesRegistry.id, id), eq(studiesRegistry.userId, user.id))).returning();
    return NextResponse.json({ study: formatStudy(updated[0]) });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^(Informe|O encerramento|Selecione)/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseErrorResponse(error, "Não foi possível atualizar o estudo.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Estudo inválido." }, { status: 400 });
    const deleted = await getDb().delete(studiesRegistry).where(and(eq(studiesRegistry.id, id), eq(studiesRegistry.userId, user.id))).returning({ id: studiesRegistry.id });
    if (!deleted[0]) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível excluir o estudo.");
  }
}
