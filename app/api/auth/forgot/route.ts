import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { hashToken, makeSecureToken, normalizeEmail } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { userHasAccess } from "@/lib/trial-accounts";
import { forbidden, isSameOriginRequest, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const generic = { message: "Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação." };
  try {
    if (!isSameOriginRequest(request)) return forbidden();
    const body = await readJson<Record<string, unknown>>(request, 8_192);
    const email = normalizeEmail(String(body.email ?? ""));
    const limited = checkRateLimit(request, "forgot", 5, 15 * 60_000, email);
    if (limited) return limited;
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail de recuperação inválido.");
    const found = await getDb()
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${email}`)
      .limit(1);
    const user = found[0];
    if (user && !user.trialExpiresAt && userHasAccess(user)) {
      const token = makeSecureToken();
      await getDb().batch([
        getDb().delete(passwordResets).where(eq(passwordResets.userId, user.id)),
        getDb().insert(passwordResets).values({
          userId: user.id,
          tokenHash: await hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        }),
      ]);
      await sendPasswordResetEmail({ name: user.name, email: user.email, token });
    }
  } catch (error) {
    console.error("Falha na recuperação de senha", error);
  }
  const response = NextResponse.json(generic);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
