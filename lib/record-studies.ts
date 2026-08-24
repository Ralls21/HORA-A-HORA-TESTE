import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { studiesRegistry } from "@/db/schema";

export async function resolveStudySnapshot(userId: number, requestedIds: number[]) {
  if (!requestedIds.length) return { studyIds: [] as number[], studyNames: [] as string[] };

  const rows = await getDb()
    .select({ id: studiesRegistry.id, name: studiesRegistry.name })
    .from(studiesRegistry)
    .where(and(eq(studiesRegistry.userId, userId), inArray(studiesRegistry.id, requestedIds)));
  const names = new Map(rows.map((study) => [study.id, study.name]));
  if (names.size !== requestedIds.length) {
    throw new Error("Selecione apenas estudantes cadastrados na sua conta.");
  }
  return {
    studyIds: requestedIds,
    // O nome fica registrado como fotografia histórica para o relatório não mudar após uma edição futura.
    studyNames: requestedIds.map((id) => names.get(id) as string),
  };
}
