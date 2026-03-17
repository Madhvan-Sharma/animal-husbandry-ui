import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";

type ChatSessionDoc = {
  _id: string;
  userId: string | null;
  createdAt: Date;
};

export async function POST(_request: NextRequest) {
  try {
    const db = await getDb();
    const col = db.collection<ChatSessionDoc>("chat_sessions");

    const session = await getSessionFromRequest().catch(() => null);
    const userId = session?.userId ?? null;

    const sessionId = randomUUID();
    const doc: ChatSessionDoc = {
      _id: sessionId,
      userId,
      createdAt: new Date(),
    };

    await col.insertOne(doc);

    return NextResponse.json({ sessionId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sessions:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}

