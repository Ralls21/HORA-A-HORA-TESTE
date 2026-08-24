import { NextResponse } from "next/server";
import { getCurrentUser, markUserAccess } from "@/lib/auth";
import { databaseErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (user) await markUserAccess(user.id);
    const response = NextResponse.json({ user });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível verificar sua sessão.");
  }
}
