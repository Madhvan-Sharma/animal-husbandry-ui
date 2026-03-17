import { cookies } from "next/headers";
import { sessionCookieName, getSession } from "./auth";

export async function getSessionFromRequest(): Promise<{
  userId: string;
  role: string;
} | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  return getSession(sessionId);
}
