import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, isConfiguredAdmin } from "@/lib/auth";
import { databaseErrorResponse, forbidden, isSameOriginRequest, readJson, requestBodyErrorResponse, unauthorized } from "@/lib/http";
import { isTrialExpired } from "@/lib/trial-accounts";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const current = await getCurrentUser();
    if (!current) return unauthorized();
    if (current.role !== "admin") return forbidden();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    if (id === current.id && (body.active === false || body.role === "user")) {
      return NextResponse.json({ error: "Você não pode desativar ou remover seu próprio acesso administrativo." }, { status: 400 });
    }
    const [target] = await getDb().select({ trialExpiresAt: users.trialExpiresAt, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (target.trialExpiresAt && body.role === "admin") {
      return NextResponse.json({ error: "Uma conta de teste não pode receber acesso administrativo." }, { status: 400 });
    }
    if (!target.trialExpiresAt && isConfiguredAdmin(target.email) && body.role === "user") {
      return NextResponse.json({ error: "Este administrador é definido por ADMIN_EMAILS. Altere a configuração do ambiente para remover o acesso." }, { status: 400 });
    }
    if (body.active === true && isTrialExpired(target.trialExpiresAt)) {
      return NextResponse.json({ error: "Este teste já expirou. Crie uma nova conta de teste." }, { status: 400 });
    }
    const changes: { active?: boolean; role?: "user" | "admin"; updatedAt: Date } = { updatedAt: new Date() };
    if (typeof body.active === "boolean") changes.active = body.active;
    if (body.role === "user" || body.role === "admin") changes.role = body.role;
    const updated = await getDb().update(users).set(changes).where(eq(users.id, id)).returning();
    if (!updated.length) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return databaseErrorResponse(error, "Não foi possível atualizar o usuário.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const current = await getCurrentUser();
    if (!current) return unauthorized();
    if (current.role !== "admin") return forbidden();
    if (!isSameOriginRequest(request)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    if (id === current.id) return NextResponse.json({ error: "Você não pode excluir sua própria conta administrativa." }, { status: 400 });
    const deleted = await getDb().delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (!deleted.length) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível excluir o usuário.");
  }
}
