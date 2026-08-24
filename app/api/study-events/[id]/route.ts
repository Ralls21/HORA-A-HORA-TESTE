import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { studiesRegistry, studyEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { nextMeetingAfterEvent, parseStudyEventInput } from "@/lib/study-events";
import { formatStudyEvent, studySummaryValues } from "@/lib/study-history-server";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveEvent(userId: number, id: number) {
  const rows = await getDb().select().from(studyEvents).where(and(eq(studyEvents.id, id), eq(studyEvents.userId, userId))).limit(1);
  return rows[0] ?? null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Encontro inválido." }, { status: 400 });
    const current = await resolveEvent(user.id, id);
    if (!current) return NextResponse.json({ error: "Encontro não encontrado." }, { status: 404 });
    const values = parseStudyEventInput(await readJson(request), current);
    const db = getDb();
    const study = await db.select().from(studiesRegistry).where(and(eq(studiesRegistry.id, current.studyId), eq(studiesRegistry.userId, user.id))).limit(1);
    if (!study[0]) return NextResponse.json({ error: "Estudante não encontrado." }, { status: 404 });
    const nextMeetingOn = nextMeetingAfterEvent(study[0], values, current);
    const [updated] = await db.batch([
      db.update(studyEvents).set(values).where(and(eq(studyEvents.id, id), eq(studyEvents.userId, user.id))).returning(),
      db.update(studiesRegistry).set({ ...studySummaryValues(user.id, current.studyId), nextMeetingOn })
        .where(and(eq(studiesRegistry.id, current.studyId), eq(studiesRegistry.userId, user.id))),
    ]);
    return NextResponse.json({ event: formatStudyEvent(updated[0]) });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^(Informe|Selecione)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return databaseErrorResponse(error, "Não foi possível atualizar o encontro.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Encontro inválido." }, { status: 400 });
    const current = await resolveEvent(user.id, id);
    if (!current) return NextResponse.json({ error: "Encontro não encontrado." }, { status: 404 });
    const db = getDb();
    const [studyRows, otherEvents] = await Promise.all([
      db.select().from(studiesRegistry).where(and(eq(studiesRegistry.id, current.studyId), eq(studiesRegistry.userId, user.id))).limit(1),
      db.select().from(studyEvents)
        .where(and(eq(studyEvents.userId, user.id), eq(studyEvents.studyId, current.studyId), ne(studyEvents.id, id)))
        .orderBy(desc(studyEvents.eventDate), desc(studyEvents.createdAt)).limit(1),
    ]);
    const study = studyRows[0];
    if (!study) return NextResponse.json({ error: "Estudante não encontrado." }, { status: 404 });
    const generatedByDeleted = nextMeetingAfterEvent({ ...study, nextMeetingOn: null }, current);
    const scheduleCameFromDeleted = study.nextMeetingOn === current.eventDate
      || study.nextMeetingOn === current.rescheduledTo
      || study.nextMeetingOn === generatedByDeleted;
    const nextMeetingOn = scheduleCameFromDeleted
      ? otherEvents[0] ? nextMeetingAfterEvent({ ...study, nextMeetingOn: null }, otherEvents[0]) : null
      : study.nextMeetingOn;
    await db.batch([
      db.delete(studyEvents).where(and(eq(studyEvents.id, id), eq(studyEvents.userId, user.id))),
      db.update(studiesRegistry).set({ ...studySummaryValues(user.id, current.studyId), nextMeetingOn })
        .where(and(eq(studiesRegistry.id, current.studyId), eq(studiesRegistry.userId, user.id))),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível excluir o encontro.");
  }
}
