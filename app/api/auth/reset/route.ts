import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { hashPassword, hashToken, validPassword } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return forbidden();
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    const limited = checkRateLimit(request, "reset", 10, 15 * 60_000, token.slice(0, 16));
    if (limited) return limited;
    if (token.length !== 64) return NextResponse.json({ error: "Este link expirou ou já foi utilizado." }, { status: 400 });
    if (!validPassword(password)) {
      return NextResponse.json({ error: "A senha precisa ter ao menos 8 caracteres, com letras e números." }, { status: 400 });
    }
    const db = getDb();
    const secured = await hashPassword(password);
    const tokenHash = await hashToken(token);
    const result = await db.execute(sql`
      with consumed as (
        update ${passwordResets}
        set ${passwordResets.usedAt} = now()
        where ${passwordResets.tokenHash} = ${tokenHash}
          and ${passwordResets.expiresAt} > now()
          and ${passwordResets.usedAt} is null
        returning ${passwordResets.userId}
      ), changed as (
        update ${users}
        set ${users.passwordHash} = ${secured.hash},
            ${users.passwordSalt} = ${secured.salt},
            ${users.updatedAt} = now()
        where ${users.id} in (select user_id from consumed)
        returning ${users.id}
      ), removed as (
        delete from ${sessions}
        where ${sessions.userId} in (select user_id from consumed)
      )
      select id from changed
    `);
    const changedRows = (result as unknown as { rows?: unknown[] }).rows ?? [];
    if (!changedRows.length) return NextResponse.json({ error: "Este link expirou ou já foi utilizado." }, { status: 400 });
    const response = NextResponse.json({ message: "Senha atualizada. Agora você já pode entrar." });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return databaseErrorResponse(error, "Não foi possível redefinir a senha.");
  }
}
