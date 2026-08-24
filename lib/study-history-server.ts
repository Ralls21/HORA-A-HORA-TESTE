import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { studiesRegistry, studyEvents } from "@/db/schema";

export function formatStudyEvent<T extends { createdAt: Date; updatedAt: Date }>(event: T) {
  return { ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() };
}

export function studySummaryValues(userId: number, studyId: number) {
  const latestDate = sql<string | null>`(
    select ${studyEvents.eventDate} from ${studyEvents}
    where ${studyEvents.userId} = ${userId} and ${studyEvents.studyId} = ${studyId} and ${studyEvents.status} = 'present'
    order by ${studyEvents.eventDate} desc, ${studyEvents.createdAt} desc limit 1
  )`;
  const latestSubject = sql<string>`coalesce((
    select ${studyEvents.subject} from ${studyEvents}
    where ${studyEvents.userId} = ${userId} and ${studyEvents.studyId} = ${studyId} and ${studyEvents.status} = 'present'
    order by ${studyEvents.eventDate} desc, ${studyEvents.createdAt} desc limit 1
  ), '')`;
  const latestProgress = sql<number>`coalesce((
    select ${studyEvents.progress} from ${studyEvents}
    where ${studyEvents.userId} = ${userId} and ${studyEvents.studyId} = ${studyId} and ${studyEvents.status} = 'present'
    order by ${studyEvents.eventDate} desc, ${studyEvents.createdAt} desc limit 1
  ), 0)`;
  return { lastContactOn: latestDate, currentSubject: latestSubject, progress: latestProgress, updatedAt: new Date() };
}

export async function refreshStudySummary(userId: number, studyId: number) {
  const latest = await getDb()
    .select({ eventDate: studyEvents.eventDate, subject: studyEvents.subject, progress: studyEvents.progress })
    .from(studyEvents)
    .where(and(eq(studyEvents.userId, userId), eq(studyEvents.studyId, studyId), eq(studyEvents.status, "present")))
    .orderBy(desc(studyEvents.eventDate), desc(studyEvents.createdAt))
    .limit(1);
  await getDb()
    .update(studiesRegistry)
    .set({ lastContactOn: latest[0]?.eventDate ?? null, currentSubject: latest[0]?.subject ?? "", progress: latest[0]?.progress ?? 0, updatedAt: new Date() })
    .where(and(eq(studiesRegistry.id, studyId), eq(studiesRegistry.userId, userId)));
}
