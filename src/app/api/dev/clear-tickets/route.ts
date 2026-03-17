import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

/**
 * Dev-only: delete all tickets, appointments, and ticket-related notifications
 * so you can test from an empty ticket collection.
 *
 * Call: DELETE /api/dev/clear-tickets?confirm=clear-tickets
 * Only works when NODE_ENV=development.
 */
export async function DELETE(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("confirm") !== "clear-tickets") {
    return NextResponse.json(
      { error: "Add ?confirm=clear-tickets to confirm" },
      { status: 400 }
    );
  }

  try {
    const db = await getDb();

    const ticketsResult = await db.collection("tickets").deleteMany({});
    const appointmentsResult = await db.collection("appointments").deleteMany({});
    const notifResult = await db.collection("notifications").deleteMany({});

    return NextResponse.json({
      ok: true,
      deleted: {
        tickets: ticketsResult.deletedCount,
        appointments: appointmentsResult.deletedCount,
        notifications: notifResult.deletedCount,
      },
    });
  } catch (e) {
    console.error("clear-tickets:", e);
    return NextResponse.json({ error: "Failed to clear collections" }, { status: 500 });
  }
}
