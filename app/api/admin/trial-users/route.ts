import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, hashPassword, isConfiguredAdmin, normalizeEmail, toSafeUser } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { createTrialEmail, createTrialExpiration, createTrialPassword } from "@/lib/trial-accounts";

export async function POST(request: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return unauthorized();
    if (current.role !== "admin" || !current.canCreateTrials) return forbidden();
    if (!isSameOriginRequest(request)) return forbidden();
    const requestId = request.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) {
      return NextResponse.json({ error: "Solicitação de criação inválida. Atualize a página e tente novamente." }, { status: 400 });
    }
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const name = String(body.name ?? "Visitante de teste").trim().slice(0, 80);
    const requestedEmail = normalizeEmail(String(body.email ?? ""));
    if (name.length < 2) {
      return NextResponse.json({ error: "Informe um nome para a conta de teste." }, { status: 400 });
    }
    if (requestedEmail && (requestedEmail.length > 254 || !/^\S+@\S+\.\S+$/.test(requestedEmail))) {
      return NextResponse.json({ error: "Informe um e-mail válido ou deixe o campo vazio." }, { status: 400 });
    }
    if (requestedEmail && isConfiguredAdmin(requestedEmail)) {
      return NextResponse.json({ error: "Um e-mail administrativo não pode ser usado em uma conta de teste." }, { status: 400 });
    }

    const email = requestedEmail || createTrialEmail();
    const db = getDb();
    const repeated = await db.select({ id: users.id }).from(users).where(eq(users.trialCreationRequestId, requestId)).limit(1);
    if (repeated.length) {
      return NextResponse.json({ error: "Esta solicitação já criou uma conta de teste e não será repetida." }, { status: 409 });
    }
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${email}`)
      .limit(1);
    if (existing.length) {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
    }

    const password = createTrialPassword();
    const secured = await hashPassword(password);
    const expiresAt = createTrialExpiration();
    const inserted = await db.insert(users).values({
      name,
      email,
      passwordHash: secured.hash,
      passwordSalt: secured.salt,
      role: "user",
      active: true,
      trialExpiresAt: expiresAt,
      trialCreatedByEmail: current.email,
      trialCreationRequestId: requestId,
    }).returning();
    if (!inserted[0]) throw new Error("O banco não retornou a conta de teste criada.");

    const response = NextResponse.json({
      user: toSafeUser(inserted[0]),
      credentials: { name, email, password, expiresAt: expiresAt.toISOString() },
    }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (String(error).includes("users_trial_creation_request_unique")) {
      return NextResponse.json({ error: "Esta solicitação já criou uma conta de teste e não será repetida." }, { status: 409 });
    }
    if (String(error).includes("users_email_unique")) {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
    }
    return databaseErrorResponse(error, "Não foi possível criar a conta de teste.");
  }
}
