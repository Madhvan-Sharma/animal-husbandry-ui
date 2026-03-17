import { NextResponse } from "next/server";
import { sessionCookieName, deleteSession } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(sessionCookieName())?.value;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("POST /api/auth/logout:", e);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
