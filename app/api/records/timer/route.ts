import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { formatRecord, MAX_RECORD_HOURS, parseRecordDate } from "@/lib/records";

type TimerInput = {
  date?: unknown;
  category?: unknown;
  minutes?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();

    const input = await readJson<TimerInput>(request);
    const parsed = parseRecordDate(String(input.date ?? ""));
    const category = input.category;
    const addedMinutes = Number(input.minutes);
    if (category !== "service" && category !== "ldc") {
      return NextResponse.json({ error: "Categoria do cronômetro inválida." }, { status: 400 });
    }
    if (!Number.isInteger(addedMinutes) || addedMinutes <= 0 || addedMinutes > MAX_RECORD_HOURS * 60) {
      return NextResponse.json({ error: "Duração do cronômetro inválida." }, { status: 400 });
    }

    const isService = category === "service";
    const inserted = {
      userId: user.id,
      date: parsed.date,
      weekday: parsed.weekday,
      minutes: isService ? addedMinutes : 0,
      ldcMinutes: isService ? 0 : addedMinutes,
      publications: 0,
      studies: 0,
      studyIds: [] as number[],
      studyNames: [] as string[],
      notes: "",
      month: parsed.month,
      year: parsed.year,
    };
    const currentColumn = isService ? records.minutes : records.ldcMinutes;
    const saved = await getDb()
      .insert(records)
      .values(inserted)
      .onConflictDoUpdate({
        target: [records.userId, records.date],
        set: {
          [isService ? "minutes" : "ldcMinutes"]: sql`${currentColumn} + ${addedMinutes}`,
          updatedAt: new Date(),
        },
        setWhere: sql`${currentColumn} + ${addedMinutes} <= ${MAX_RECORD_HOURS * 60}`,
      })
      .returning();

    if (!saved[0]) {
      return NextResponse.json(
        { error: `O total ultrapassaria o limite de ${MAX_RECORD_HOURS} horas. O cronômetro não foi aplicado.` },
        { status: 409 },
      );
    }
    const response = NextResponse.json({ record: formatRecord(saved[0]) }, { status: 200 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^Informe uma data válida/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseErrorResponse(error, "Não foi possível aplicar o tempo do cronômetro.");
  }
}
