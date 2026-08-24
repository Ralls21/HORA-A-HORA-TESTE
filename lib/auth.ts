import { and, eq, gt, isNotNull, lt, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { passwordResets, sessions, users, type User } from "@/db/schema";
import { userHasAccess } from "@/lib/trial-accounts";

const SESSION_COOKIE = "hora_session";
const SESSION_DAYS = 30;
const ITERATIONS = 210_000;

export type SafeUser = {
  id: number;
  name: string;
  email: string;
  goalHours: number;
  annualGoalHours: number;
  roundingMode: "none" | "nearest" | "up" | "down";
  role: "user" | "admin";
  canCreateTrials: boolean;
  active: boolean;
  trialExpiresAt: string | null;
  sessionExpiresAt: string | null;
  createdAt: string;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (hex.length % 2) return new Uint8Array();
  const values = hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [];
  return new Uint8Array(values);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isConfiguredAdmin(email: string) {
  return configuredAdminEmails().includes(normalizeEmail(email));
}

export function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isConfiguredTrialCreator(email: string) {
  const creators = (process.env.TRIAL_CREATOR_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return creators.includes(normalizeEmail(email));
}

export function adminSelfRegistrationEnabled() {
  return process.env.ALLOW_ADMIN_SELF_REGISTRATION === "true";
}

export function toSafeUser(user: User, sessionExpiresAt: Date | null = null): SafeUser {
  // Uma conta temporária nunca pode herdar privilégios por coincidir com um e-mail configurado.
  const role = !user.trialExpiresAt && (user.role === "admin" || isConfiguredAdmin(user.email)) ? "admin" : "user";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    goalHours: user.goalHours,
    annualGoalHours: user.annualGoalHours,
    roundingMode: user.roundingMode,
    role,
    canCreateTrials: role === "admin" && isConfiguredTrialCreator(user.email),
    active: user.active,
    trialExpiresAt: user.trialExpiresAt?.toISOString() ?? null,
    sessionExpiresAt: sessionExpiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string) {
  const calculated = await hashPassword(password, salt);
  const a = hexToBytes(calculated.hash);
  const b = hexToBytes(expectedHash);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function makeSecureToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function prepareSession(maximumExpiresAt?: Date | null) {
  const token = makeSecureToken();
  const tokenHash = await hashToken(token);
  const standardExpiration = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const expiresAt = maximumExpiresAt && maximumExpiresAt < standardExpiration ? maximumExpiresAt : standardExpiration;
  return { token, tokenHash, expiresAt };
}

export async function createSession(userId: number, maximumExpiresAt?: Date | null) {
  const { token, tokenHash, expiresAt } = await prepareSession(maximumExpiresAt);
  const db = getDb();
  const now = new Date();
  await db.batch([
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.delete(passwordResets).where(or(lt(passwordResets.expiresAt, now), isNotNull(passwordResets.usedAt))),
    db.insert(sessions).values({ userId, tokenHash, expiresAt }),
  ]);
  return { token, expiresAt };
}

export async function markUserAccess(userId: number) {
  await getDb().update(users).set({ lastAccessAt: new Date() }).where(eq(users.id, userId));
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  try {
    if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  } finally {
    await clearSessionCookie();
  }
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({ user: users, sessionExpiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user;
  if (!user || !userHasAccess(user)) return null;
  return toSafeUser(user, rows[0].sessionExpiresAt);
}

export function validPassword(password: string) {
  return password.length >= 8 && password.length <= 256 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
