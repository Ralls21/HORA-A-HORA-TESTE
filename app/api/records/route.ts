import { and, asc, desc, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { resolveStudySnapshot } from "@/lib/record-studies";
import { formatRecord, parseRecordInput } from "@/lib/records";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const month = Number(url.searchParams.get("month"));
    const year = Number(url.searchParams.get("year"));
    const hasMonth = url.searchParams.has("month");
    const hasYear = url.searchParams.has("year");
    const validYear = year >= 2000 && year <= 2200;
    const validMonth = month >= 1 && month <= 12;
    if ((hasMonth && !validMonth) || (hasYear && !validYear) || (hasMonth && !hasYear)) {
      return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    }
    const latest = url.searchParams.get("latest") === "1";
    const through = url.searchParams.get("through");
    if (through && !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
      return NextResponse.json({ error: "Data-limite inválida." }, { status: 400 });
    }
    const where = validMonth && validYear
      ? and(eq(records.userId, user.id), eq(records.month, month), eq(records.year, year))
      : validYear
        ? and(eq(records.userId, user.id), eq(records.year, year))
        : through
          ? and(eq(records.userId, user.id), lte(records.date, through))
          : eq(records.userId, user.id);
    const rows = latest
      ? await getDb().select().from(records).where(where).orderBy(desc(records.date)).limit(1)
      : await getDb().select().from(records).where(where).orderBy(asc(records.date));
    const response = NextResponse.json({ records: rows.map(formatRecord) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível carregar os registros.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const parsed = parseRecordInput(await readJson(request));
    const { studyIds: requestedStudyIds, ...recordValues } = parsed;
    const studySnapshot = await resolveStudySnapshot(user.id, requestedStudyIds);
    const values = { ...recordValues, ...studySnapshot };
    const db = getDb();
    const saved = await db
      .insert(records)
      .values({ ...values, userId: user.id })
      .onConflictDoNothing({ target: [records.userId, records.date] })
      .returning();
    if (!saved[0]) {
      const existing = await db.select().from(records)
        .where(and(eq(records.userId, user.id), eq(records.date, values.date))).limit(1);
      return NextResponse.json(
        { error: "Já existe um registro nesta data. Atualize a tela antes de editar.", conflict: true, record: existing[0] ? formatRecord(existing[0]) : null },
        { status: 409 },
      );
    }
    const response = NextResponse.json({ record: formatRecord(saved[0]), created: true }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^(Informe|As horas|Publicações|Selecione)/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseErrorResponse(error, "Não foi possível salvar o registro.");
  }
}
