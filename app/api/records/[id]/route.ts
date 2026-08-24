import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { resolveStudySnapshot } from "@/lib/record-studies";
import { formatRecord, parseRecordInput } from "@/lib/records";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    const input = await readJson<Record<string, unknown>>(request);
    const expectedUpdatedAt = typeof input.expectedUpdatedAt === "string" ? new Date(input.expectedUpdatedAt) : null;
    if (input.expectedUpdatedAt !== undefined && (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime()))) {
      return NextResponse.json({ error: "Versão do registro inválida." }, { status: 400 });
    }
    const parsed = parseRecordInput(input as Parameters<typeof parseRecordInput>[0]);
    const { studyIds: requestedStudyIds, ...recordValues } = parsed;
    const studySnapshot = await resolveStudySnapshot(user.id, requestedStudyIds);
    const values = { ...recordValues, ...studySnapshot };
    const db = getDb();
    const ownership = and(eq(records.id, id), eq(records.userId, user.id));
    let updated = await db
      .update(records)
      .set(values)
      .where(expectedUpdatedAt ? and(ownership, eq(records.updatedAt, expectedUpdatedAt)) : ownership)
      .returning();
    if (!updated.length && expectedUpdatedAt) {
      updated = await db
        .update(records)
        .set(values)
        .where(ownership)
        .returning();
    }
    if (!updated.length) {
      const existing = await db.select().from(records).where(ownership).limit(1);
      if (!existing.length) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
      return NextResponse.json(
        { error: "Este registro foi alterado em outro dispositivo. Recarregue antes de salvar.", conflict: true, record: formatRecord(existing[0]) },
        { status: 409 },
      );
    }
    const response = NextResponse.json({ record: formatRecord(updated[0]) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (String(error).includes("records_user_date_unique")) {
      return NextResponse.json({ error: "Já existe um registro nesta data." }, { status: 409 });
    }
    if (error instanceof Error && /^(Informe|As horas|Publicações|Selecione)/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseErrorResponse(error, "Não foi possível atualizar o registro.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    const deleted = await getDb()
      .delete(records)
      .where(and(eq(records.id, id), eq(records.userId, user.id)))
      .returning({ id: records.id });
    if (!deleted.length) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível excluir o registro.");
  }
}
