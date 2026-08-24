import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest } from "@/lib/http";

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return forbidden();
    await destroyCurrentSession();
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "A sessão local foi encerrada, mas o servidor não confirmou o logout.");
  }
}
