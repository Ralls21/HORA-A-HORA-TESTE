import { isNotNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import {
  adminSelfRegistrationEnabled,
  hashPassword,
  isConfiguredAdmin,
  normalizeEmail,
  prepareSession,
  setSessionCookie,
  toSafeUser,
  validPassword,
} from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return forbidden();
    const limited = checkRateLimit(request, "register", 5, 60 * 60_000);
    if (limited) return limited;
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const name = String(body.name ?? "").trim().slice(0, 80);
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const configuredAdmin = isConfiguredAdmin(email);
    const adminBootstrap = configuredAdmin && adminSelfRegistrationEnabled();
    if (configuredAdmin && !adminBootstrap) {
      return NextResponse.json({ error: "Este endereço administrativo não pode ser criado pelo cadastro público." }, { status: 403 });
    }
    if (name.length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!validPassword(password)) {
      return NextResponse.json({ error: "A senha precisa ter ao menos 8 caracteres, com letras e números." }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${email}`)
      .limit(1);
    if (existing.length) return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
    const secured = await hashPassword(password);
    const session = await prepareSession();
    const now = new Date();
    const [, , inserted] = await db.batch([
      db.delete(sessions).where(lt(sessions.expiresAt, now)),
      db.delete(passwordResets).where(or(lt(passwordResets.expiresAt, now), isNotNull(passwordResets.usedAt))),
      db.insert(users).values({
        name,
        email,
        passwordHash: secured.hash,
        passwordSalt: secured.salt,
        role: adminBootstrap ? "admin" : "user",
        lastAccessAt: now,
      }).returning(),
      db.insert(sessions).values({
        userId: sql`(select ${users.id} from ${users} where ${users.email} = ${email})`,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
      }),
    ]);
    if (!inserted[0]) throw new Error("O banco não retornou o usuário criado.");
    await setSessionCookie(session.token, session.expiresAt);
    const response = NextResponse.json({ user: toSafeUser(inserted[0], session.expiresAt) }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (String(error).includes("users_email_unique")) {
      return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
    }
    return databaseErrorResponse(error, "Não foi possível criar a conta.");
  }
}
