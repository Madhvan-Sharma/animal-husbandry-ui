import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/mongodb";

const SESSION_COOKIE = "animal_husbandry_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
const SALT_LEN = 16;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = scryptSync(password, salt, KEY_LEN);
  const hashBuf = Buffer.from(hash, "hex");
  return key.length === hashBuf.length && timingSafeEqual(key, hashBuf);
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function sessionMaxAge(): number {
  return SESSION_MAX_AGE_SEC;
}

type SessionDoc = { _id: string; userId: string; role: string; expiresAt: Date };

export async function createSession(userId: string, role: string): Promise<string> {
  const db = await getDb();
  const col = db.collection<SessionDoc>("sessions");
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
  await col.insertOne({
    _id: sessionId,
    userId,
    role,
    expiresAt,
  });
  return sessionId;
}

export async function getSession(
  sessionId: string | undefined
): Promise<{ userId: string; role: string } | null> {
  if (!sessionId) return null;
  const db = await getDb();
  const col = db.collection<SessionDoc>("sessions");
  const doc = await col.findOne({
    _id: sessionId,
    expiresAt: { $gt: new Date() },
  });
  if (!doc) return null;
  return { userId: String(doc.userId), role: String(doc.role) };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.collection<SessionDoc>("sessions").deleteOne({ _id: sessionId });
}
