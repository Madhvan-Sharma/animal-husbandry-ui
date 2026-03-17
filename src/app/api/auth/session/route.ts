import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionCookieName, getSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(sessionCookieName())?.value;
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const db = await getDb();
    let userDoc;
    try {
      userDoc = await db.collection("users").findOne({
        _id: new ObjectId(session.userId),
      });
    } catch {
      userDoc = null;
    }
    if (!userDoc) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: String(userDoc._id),
        username: userDoc.username,
        role: session.role,
        name: userDoc.name ?? userDoc.username,
        email: userDoc.email ?? "",
        specialization: userDoc.specialization ?? "",
      },
    });
  } catch (e) {
    console.error("GET /api/auth/session:", e);
    return NextResponse.json({ user: null });
  }
}
