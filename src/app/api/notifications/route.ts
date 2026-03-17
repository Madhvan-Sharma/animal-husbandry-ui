import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? session?.userId;
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const db = await getDb();
    const list = await db
      .collection("notifications")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(
      list.map((n) => ({
        ...n,
        _id: String(n._id),
      }))
    );
  } catch (e) {
    console.error("GET /api/notifications:", e);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, read } = body as { id?: string; read?: boolean };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    await db.collection("notifications").updateOne(
      { _id: new ObjectId(id) },
      { $set: { read: !!read } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/notifications:", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
