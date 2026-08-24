import { isNotNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { normalizeEmail, prepareSession, setSessionCookie, toSafeUser, verifyPassword } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTrialExpired } from "@/lib/trial-accounts";

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return forbidden();
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const limited = checkRateLimit(request, "login", 10, 15 * 60_000, email);
    if (limited) return limited;
    if (email.length > 254 || password.length > 256) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }
    // Aceita contas antigas mesmo que o e-mail tenha sido salvo com espaços ou letras maiúsculas.
    const found = await getDb()
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${email}`)
      .limit(1);
    const user = found[0];
    if (!user || !(await verifyPassword(password, user.passwordHash, user.passwordSalt))) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }
    if (!user.active) return NextResponse.json({ error: "Esta conta foi desativada. Fale com o administrador." }, { status: 403 });
    if (isTrialExpired(user.trialExpiresAt)) {
      return NextResponse.json({ error: "O período de teste desta conta expirou." }, { status: 403 });
    }
    const session = await prepareSession(user.trialExpiresAt);
    const now = new Date();
    await getDb().batch([
      getDb().delete(sessions).where(lt(sessions.expiresAt, now)),
      getDb().delete(passwordResets).where(or(lt(passwordResets.expiresAt, now), isNotNull(passwordResets.usedAt))),
      getDb().insert(sessions).values({ userId: user.id, tokenHash: session.tokenHash, expiresAt: session.expiresAt }),
      getDb().update(users).set({ lastAccessAt: now }).where(sql`${users.id} = ${user.id}`),
    ]);
    await setSessionCookie(session.token, session.expiresAt);
    const response = NextResponse.json({ user: toSafeUser({ ...user, lastAccessAt: now }, session.expiresAt) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return databaseErrorResponse(error, "Não foi possível entrar.");
  }
}
