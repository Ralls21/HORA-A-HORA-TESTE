import { asc, ilike, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { configuredAdminEmails, getCurrentUser, isConfiguredAdmin } from "@/lib/auth";
import { databaseErrorResponse, forbidden, unauthorized } from "@/lib/http";
import { isTrialExpired } from "@/lib/trial-accounts";

type AdminListUser = Pick<typeof users.$inferSelect, "id" | "name" | "email" | "role" | "active" | "trialExpiresAt" | "trialCreatedByEmail" | "lastAccessAt" | "createdAt">;

function adminListUser(user: AdminListUser) {
  const environmentAdmin = !user.trialExpiresAt && isConfiguredAdmin(user.email);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.trialExpiresAt ? "test" as const : environmentAdmin || user.role === "admin" ? "admin" as const : "user" as const,
    roleManagedByEnvironment: environmentAdmin,
    active: user.active,
    trialExpired: isTrialExpired(user.trialExpiresAt),
    trialCreatedByEmail: user.trialCreatedByEmail,
    lastAccessAt: user.lastAccessAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return unauthorized();
    if (current.role !== "admin") return forbidden();
    const parameters = new URL(request.url).searchParams;
    const search = parameters.get("search")?.trim().slice(0, 100) ?? "";
    const page = Math.max(1, Math.floor(Number(parameters.get("page") ?? 1) || 1));
    const limit = Math.min(100, Math.max(10, Math.floor(Number(parameters.get("limit") ?? 50) || 50)));
    const db = getDb();
    const filter = search ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`)) : undefined;
    const environmentAdmins = configuredAdminEmails();
    const adminPredicate = environmentAdmins.length
      ? or(sql`${users.role} = 'admin'`, inArray(sql<string>`lower(trim(${users.email}))`, environmentAdmins))
      : sql`${users.role} = 'admin'`;
    const [rows, countRows, summaryRows] = await db.batch([
      db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        trialExpiresAt: users.trialExpiresAt,
        trialCreatedByEmail: users.trialCreatedByEmail,
        lastAccessAt: users.lastAccessAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(filter)
      .orderBy(asc(users.name))
      .limit(limit)
      .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)::int` }).from(users).where(filter),
      db.select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${users.active} = true and (${users.trialExpiresAt} is null or ${users.trialExpiresAt} > now()))::int`,
        admins: sql<number>`count(*) filter (where ${users.trialExpiresAt} is null and (${adminPredicate}))::int`,
        trials: sql<number>`count(*) filter (where ${users.active} = true and ${users.trialExpiresAt} > now())::int`,
      }).from(users),
    ]);
    const filteredTotal = countRows[0]?.total ?? 0;
    const response = NextResponse.json({
      users: rows.map(adminListUser),
      summary: summaryRows[0],
      pagination: { page, limit, total: filteredTotal, pages: Math.max(1, Math.ceil(filteredTotal / limit)) },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return databaseErrorResponse(error, "Não foi possível carregar os usuários.");
  }
}
