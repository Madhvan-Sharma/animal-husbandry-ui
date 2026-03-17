import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const db = await getDb();
    const col = db.collection("users");

    const query: Record<string, unknown> = {};
    if (role) {
      query.role = role;
    }

    const users = await col
      .find(query, { projection: { password: 0 } })
      .sort({ username: 1 })
      .toArray();

    return NextResponse.json(
      users.map((u) => ({
        id: String(u._id),
        username: u.username,
        role: u.role,
        name: u.name ?? u.username,
        email: u.email ?? "",
        specialization: u.specialization ?? "",
      })),
    );
  } catch (error) {
    console.error("GET /api/users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

