import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionFromRequest();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const doctorId =
      body && typeof body.doctorId === "string" ? body.doctorId.trim() : "";
    if (!doctorId) {
      return NextResponse.json(
        { error: "doctorId is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const usersCol = db.collection("users");
    const doctor = await usersCol.findOne({ _id: new ObjectId(doctorId) });
    const doctorRole = (doctor as { role?: string }).role;
    if (!doctor || (doctorRole !== "doctor" && doctorRole !== "vet")) {
      return NextResponse.json(
        { error: "Vet/doctor not found" },
        { status: 404 },
      );
    }

    const col = db.collection("tickets");
    const oid = new ObjectId(id);
    await col.updateOne(
      { _id: oid },
      { $set: { assignedDoctorId: doctorId } },
    );
    const updated = await col.findOne({ _id: oid });
    if (!updated) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ...updated, _id: String(updated._id) });
  } catch (error) {
    console.error("PATCH /api/tickets/[id]/assign:", error);
    return NextResponse.json(
      { error: "Failed to assign consultation" },
      { status: 500 },
    );
  }
}

