import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  verifyPassword,
  createSession,
  sessionCookieName,
  sessionMaxAge,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };
    if (!username || typeof username !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({
      username: username.trim().toLowerCase(),
    });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const ok = verifyPassword(password, user.passwordHash as string);
    if (!ok) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const userId = String(user._id);
    const role = (user.role as string) || "user";
    const sessionId = await createSession(userId, role);

    const res = NextResponse.json({
      user: {
        id: userId,
        username: user.username,
        role,
        name: user.name ?? user.username,
        email: user.email ?? "",
        specialization: user.specialization ?? "",
      },
    });

    res.cookies.set(sessionCookieName(), sessionId, {
      path: "/",
      maxAge: sessionMaxAge(),
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (e) {
    console.error("POST /api/auth/login:", e);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
