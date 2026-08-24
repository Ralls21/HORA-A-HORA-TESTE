import { and, arrayContains, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { records, studiesRegistry, studyEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { formatRecord } from "@/lib/records";
import { nextMeetingAfterEvent, parseStudyEventInput } from "@/lib/study-events";
import { formatStudyEvent, studySummaryValues } from "@/lib/study-history-server";

type RouteContext = { params: Promise<{ id: string }> };

function formatStudy<T extends { createdAt: Date; updatedAt: Date }>(study: T) {
  return { ...study, createdAt: study.createdAt.toISOString(), updatedAt: study.updatedAt.toISOString() };
}

async function resolveStudy(userId: number, id: number) {
  const rows = await getDb().select().from(studiesRegistry).where(and(eq(studiesRegistry.id, id), eq(studiesRegistry.userId, userId))).limit(1);
  return rows[0] ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Estudante inválido." }, { status: 400 });
    const study = await resolveStudy(user.id, id);
    if (!study) return NextResponse.json({ error: "Estudante não encontrado." }, { status: 404 });
    const [events, userRecords] = await Promise.all([
      getDb().select().from(studyEvents).where(and(eq(studyEvents.userId, user.id), eq(studyEvents.studyId, id))).orderBy(desc(studyEvents.eventDate), desc(studyEvents.createdAt)),
      getDb().select().from(records).where(and(eq(records.userId, user.id), arrayContains(records.studyIds, [id]))).orderBy(desc(records.date)),
    ]);
    const response = NextResponse.json({ study: formatStudy(study), events: events.map(formatStudyEvent), records: userRecords.map(formatRecord) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível carregar o histórico do estudante.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Estudante inválido." }, { status: 400 });
    const study = await resolveStudy(user.id, id);
    if (!study) return NextResponse.json({ error: "Estudante não encontrado." }, { status: 404 });
    const values = parseStudyEventInput(await readJson(request));
    const db = getDb();
    const nextMeetingOn = nextMeetingAfterEvent(study, values);
    const [inserted] = await db.batch([
      db.insert(studyEvents).values({ ...values, userId: user.id, studyId: id }).returning(),
      db.update(studiesRegistry)
        .set({ ...studySummaryValues(user.id, id), nextMeetingOn })
        .where(and(eq(studiesRegistry.id, id), eq(studiesRegistry.userId, user.id))),
    ]);
    if (!inserted[0]) throw new Error("O banco não retornou o encontro criado.");
    const updatedStudy = await resolveStudy(user.id, id);
    const response = NextResponse.json({ event: formatStudyEvent(inserted[0]), study: updatedStudy ? formatStudy(updatedStudy) : null }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^(Informe|Selecione)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return databaseErrorResponse(error, "Não foi possível registrar o encontro.");
  }
}
