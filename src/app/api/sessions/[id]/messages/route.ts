import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";

type ChatMessageDoc = {
  _id?: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
  createdAt: Date;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const col = db.collection<ChatMessageDoc>("chat_messages");

    const messages = await col
      .find({ sessionId: id })
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json(
      messages.map((m) => ({
        sessionId: m.sessionId,
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl ?? null,
        createdAt: m.createdAt,
      })),
    );
  } catch (error) {
    console.error("GET /api/sessions/[id]/messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch session messages" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    if (
      !body ||
      (body.role !== "user" && body.role !== "assistant") ||
      typeof body.content !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const col = db.collection<ChatMessageDoc>("chat_messages");

    const session = await getSessionFromRequest().catch(() => null);
    const userId = session?.userId ?? null;

    const doc: ChatMessageDoc & { userId: string | null } = {
      sessionId: id,
      role: body.role,
      content: body.content,
      imageUrl:
        typeof body.imageUrl === "string" && body.imageUrl.trim()
          ? body.imageUrl.trim()
          : null,
      createdAt: new Date(),
      userId,
    };

    await col.insertOne(doc);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sessions/[id]/messages:", error);
    return NextResponse.json(
      { error: "Failed to store message" },
      { status: 500 },
    );
  }
}

