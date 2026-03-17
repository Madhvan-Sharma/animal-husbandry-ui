import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const db = await getDb();
    const list = await db
      .collection("appointments")
      .find({ userId })
      .sort({ scheduledAt: 1 })
      .limit(100)
      .toArray();

    return NextResponse.json(
      list.map((a) => ({
        ...a,
        _id: String(a._id),
        scheduledAt: a.scheduledAt instanceof Date ? a.scheduledAt.toISOString() : a.scheduledAt,
      }))
    );
  } catch (e) {
    console.error("GET /api/appointments:", e);
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
  }
}
