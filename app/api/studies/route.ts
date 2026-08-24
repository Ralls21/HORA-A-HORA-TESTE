import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { studiesRegistry } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { parseStudyInput } from "@/lib/studies";

function formatStudy<T extends { createdAt: Date; updatedAt: Date }>(study: T) {
  return { ...study, createdAt: study.createdAt.toISOString(), updatedAt: study.updatedAt.toISOString() };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const rows = await getDb().select().from(studiesRegistry).where(eq(studiesRegistry.userId, user.id)).orderBy(asc(studiesRegistry.name));
    const response = NextResponse.json({ studies: rows.map(formatStudy) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível carregar os estudos.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!isSameOriginRequest(request)) return forbidden();
    const values = parseStudyInput(await readJson(request));
    const inserted = await getDb().insert(studiesRegistry).values({ ...values, userId: user.id }).returning();
    if (!inserted[0]) throw new Error("O banco não retornou o estudo criado.");
    return NextResponse.json({ study: formatStudy(inserted[0]) }, { status: 201 });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && /^(Informe|O encerramento|Selecione)/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseErrorResponse(error, "Não foi possível cadastrar o estudo.");
  }
}
