import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";
import { scheduleAppointmentEmail, scheduleFollowUpEmail } from "@/lib/scheduler";
import { ObjectId } from "mongodb";

type ImageAttachment = {
  type: "image";
  mimeType: string;
  data: string; // base64
  metadata?: { name?: string; filename?: string };
};

function sanitizeImageAttachments(input: unknown): ImageAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: ImageAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    const mimeType = (item as { mimeType?: unknown }).mimeType;
    const data = (item as { data?: unknown }).data;
    if (type !== "image") continue;
    if (typeof mimeType !== "string" || !mimeType.startsWith("image/")) continue;
    if (typeof data !== "string" || data.length < 8) continue;
    if (data.length > 3_000_000) continue;
    const metadata = (item as { metadata?: unknown }).metadata;
    const name =
      metadata && typeof metadata === "object" && metadata !== null
        ? (metadata as { name?: unknown }).name
        : undefined;
    const filename =
      metadata && typeof metadata === "object" && metadata !== null
        ? (metadata as { filename?: unknown }).filename
        : undefined;
    out.push({
      type: "image",
      mimeType,
      data,
      metadata: {
        ...(typeof name === "string" ? { name: name.slice(0, 200) } : {}),
        ...(typeof filename === "string" ? { filename: filename.slice(0, 200) } : {}),
      },
    });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Parse FOLLOW_UP_EMAIL_SCHEDULED_AT: relative ("7 days", "5 mins", "1 hour") or absolute ISO.
 * Returns scheduled Date from baseDate for relative, or the parsed date for absolute.
 */
function parseFollowUpSchedule(value: string, baseDate: Date): Date | null {
  const s = value.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const relativeMatch = lower.match(
    /^(\d+)\s*(day|days|hour|hours|min|mins|minute|minutes|week|weeks|sec|secs|second|seconds)$/
  );
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    let ms = 0;
    switch (unit) {
      case "day":
      case "days":
        ms = num * 24 * 60 * 60 * 1000;
        break;
      case "hour":
      case "hours":
        ms = num * 60 * 60 * 1000;
        break;
      case "min":
      case "mins":
      case "minute":
      case "minutes":
        ms = num * 60 * 1000;
        break;
      case "week":
      case "weeks":
        ms = num * 7 * 24 * 60 * 60 * 1000;
        break;
      case "sec":
      case "secs":
      case "second":
      case "seconds":
        ms = num * 1000;
        break;
      default:
        return null;
    }
    return new Date(baseDate.getTime() + ms);
  }
  const absolute = new Date(s);
  return Number.isFinite(absolute.getTime()) ? absolute : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    const ticket = await db.collection("tickets").findOne({ _id: new ObjectId(id) });
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ ...ticket, _id: String(ticket._id) });
  } catch (e) {
    console.error("GET /api/tickets/[id]:", e);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const session = await getSessionFromRequest();
    const isAdmin = session?.role === "admin";
    const isVetOrDoctor = session?.role === "vet" || session?.role === "doctor";
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Admin can close any ticket without being assigned
    if (isAdmin && body.close === true) {
      const db = await getDb();
      const col = db.collection("tickets");
      const oid = new ObjectId(id);
      const ticket = await col.findOne({ _id: oid });
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      const update = {
        status: "closed",
        closedAt: new Date(),
        nextSteps: body.nextSteps ?? (ticket as { nextSteps?: string }).nextSteps ?? null,
      };
      await col.updateOne({ _id: oid }, { $set: update });
      const updated = await col.findOne({ _id: oid });
      return NextResponse.json({ ...updated, _id: String(updated!._id) });
    }
    const db = await getDb();
    const col = db.collection("tickets");
    const oid = new ObjectId(id);
    const ticket = await col.findOne({ _id: oid });
    if (!ticket) return NextResponse.json({ error: "Consultation not found" }, { status: 404 });

    const update: Record<string, unknown> = {};
    const notifCol = db.collection("notifications");
    const patientId = String(ticket.userId);
    const isAssignedToMe = String(ticket.assignedDoctorId ?? "") === session.userId;
    const isOwner = patientId === session.userId;

    // User can add images to their own ticket
    if (body.addImages !== undefined) {
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const incoming = sanitizeImageAttachments(body.addImages);
      if (incoming.length === 0) {
        return NextResponse.json({ error: "No valid images provided" }, { status: 400 });
      }
      const existing = Array.isArray((ticket as { attachments?: unknown }).attachments)
        ? ((ticket as { attachments?: ImageAttachment[] }).attachments ?? [])
        : [];
      const merged = [...existing, ...incoming].slice(0, 24);
      update.attachments = merged;
    }

    if (body.assign !== undefined) {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      update.assignedDoctorId = body.assign ? session.userId : null;
    }
    // Allow updating diagnosis/medication notes after ticket creation.
    if (body.diagnosis !== undefined || body.medicationNotes !== undefined) {
      if (!isAdmin && !isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const currentDiagnosis = typeof ticket.diagnosis === "string" ? ticket.diagnosis : "";
      let baseLines = currentDiagnosis
        ? currentDiagnosis.split("\n").filter((l: string) => !l.trim().toLowerCase().startsWith("medicationnotes:"))
        : [];

      let newLines: string[] = [];
      const diagnosis = body.diagnosis as
        | string
        | {
            symptoms?: string[];
            durationOfSymptoms?: string;
            relevantMessages?: string[];
          }
        | undefined;

      if (typeof diagnosis === "string") {
        newLines = diagnosis.split("\n");
      } else if (diagnosis && typeof diagnosis === "object") {
        if (Array.isArray(diagnosis.symptoms) && diagnosis.symptoms.length) {
          newLines.push(`Symptoms: [${diagnosis.symptoms.map((s) => `"${s}"`).join(", ")}]`);
        }
        if (diagnosis.durationOfSymptoms) {
          newLines.push(`DurationOfSymptoms: ${diagnosis.durationOfSymptoms}`);
        }
        if (Array.isArray(diagnosis.relevantMessages) && diagnosis.relevantMessages.length) {
          newLines.push(
            `RelevantMessages: [${diagnosis.relevantMessages
              .map((s) => `"${s}"`)
              .join(", ")}]`,
          );
        }
      } else if (!diagnosis && !body.medicationNotes) {
        // Explicitly clear diagnosis if empty object/null provided.
        baseLines = [];
      }

      const mergedLines = [...newLines, ...baseLines.filter((l) => !newLines.includes(l))];

      const medicationNotes =
        typeof body.medicationNotes === "string" ? body.medicationNotes.trim() : "";
      if (medicationNotes) {
        mergedLines.push(`MedicationNotes: ${medicationNotes}`);
      }

      update.diagnosis = mergedLines.join("\n");
    }
    if (body.addMessage != null && typeof body.addMessage === "string") {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];
      messages.push({
        from: "vet",
        text: body.addMessage.trim(),
        createdAt: new Date(),
      });
      update.messages = messages;
      update.status = "awaiting_patient";
      await notifCol.insertOne({
        userId: patientId,
        ticketId: id,
        type: "vet_message",
        title: "Vet replied",
        body: body.addMessage.trim().slice(0, 100),
        read: false,
        createdAt: new Date(),
      });
    }
    if (body.requestDoc != null && typeof body.requestDoc === "string") {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];
      const hasMedicine = messages.some((m: { from?: string; text?: string }) => m.from === "vet" && (m.text ?? "").startsWith("Medicine recommended:"));
      if (hasMedicine) return NextResponse.json({ error: "Cannot request document after medicine has been recommended" }, { status: 400 });
      const docRequests = Array.isArray(ticket.docRequests) ? [...ticket.docRequests] : [];
      docRequests.push({
        type: body.requestDoc.trim(),
        requestedAt: new Date(),
        fulfilledAt: null,
        summary: null,
      });
      update.docRequests = docRequests;
      update.status = "awaiting_docs";
      await notifCol.insertOne({
        userId: patientId,
        ticketId: id,
        type: "doc_request",
        title: "Document requested",
        body: `Please upload: ${body.requestDoc.trim()}`,
        read: false,
        createdAt: new Date(),
      });
    }
    const requestDocsArray = Array.isArray(body.requestDocs)
      ? body.requestDocs.filter((t: unknown) => typeof t === "string" && String(t).trim().length > 0).map((t: string) => String(t).trim())
      : [];
    if (requestDocsArray.length > 0) {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];
      const hasMedicine = messages.some((m: { from?: string; text?: string }) => m.from === "vet" && (m.text ?? "").startsWith("Medicine recommended:"));
      if (hasMedicine) return NextResponse.json({ error: "Cannot request document after medicine has been recommended" }, { status: 400 });
      const docRequests = Array.isArray(ticket.docRequests) ? [...ticket.docRequests] : [];
      for (const type of requestDocsArray) {
        docRequests.push({
          type,
          requestedAt: new Date(),
          fulfilledAt: null,
          summary: null,
        });
      }
      update.docRequests = docRequests;
      update.status = "awaiting_docs";
      await notifCol.insertOne({
        userId: patientId,
        ticketId: id,
        type: "doc_request",
        title: "Documents requested",
        body: `Please upload: ${requestDocsArray.join(", ")}`,
        read: false,
        createdAt: new Date(),
      });
    }
    if (body.recommendMedicine != null && typeof body.recommendMedicine === "string") {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const text = body.recommendMedicine.trim();
      if (text) {
        const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];
        messages.push({
          from: "vet",
          text: `Medicine recommended: ${text}`,
          createdAt: new Date(),
        });
        update.messages = messages;
        update.status = "closed";
        update.closedAt = new Date();
        update.nextSteps = ticket.nextSteps ?? null;
        await notifCol.insertOne({
          userId: patientId,
          ticketId: id,
          type: "medicine_recommendation",
          title: "Medicine recommended",
          body: text.slice(0, 100),
          read: false,
          createdAt: new Date(),
        });
      }
    }
    if (body.close === true) {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      update.status = "closed";
      update.closedAt = new Date();
      update.nextSteps = body.nextSteps ?? ticket.nextSteps ?? null;
    }
    if (body.suggestMeetAndClose === true) {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];
      const hasMedicine = messages.some((m: { from?: string; text?: string }) => m.from === "vet" && (m.text ?? "").startsWith("Medicine recommended:"));
      if (hasMedicine) return NextResponse.json({ error: "Cannot schedule appointment after medicine has been recommended" }, { status: 400 });
      const scheduledAt = body.appointmentTime ? new Date(body.appointmentTime) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      update.status = "appointment_scheduled";
      update.nextSteps = body.nextSteps ?? ticket.nextSteps ?? "Physical meet suggested";
      update.appointment = {
        scheduledAt,
        type: "physical",
        doctorId: session.userId,
      };
      await db.collection("appointments").insertOne({
        ticketId: id,
        userId: patientId,
        doctorId: session.userId,
        scheduledAt,
        type: "physical",
        status: "scheduled",
        createdAt: new Date(),
      });
      await notifCol.insertOne({
        userId: patientId,
        ticketId: id,
        type: "appointment_scheduled",
        title: "Appointment scheduled",
        body: `Your appointment is scheduled for ${scheduledAt.toLocaleString()}`,
        read: false,
        createdAt: new Date(),
      });
      if (process.env.EMAIL_TO) {
        try {
          const doctorUser = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
          const doctorName = (doctorUser as { name?: string; username?: string })?.name ?? (doctorUser as { username?: string })?.username ?? "Your vet";
          await scheduleAppointmentEmail({
            patientName: (ticket as { patientName?: string }).patientName ?? "Patient",
            patientEmail: process.env.EMAIL_TO,
            appointmentDatetime: scheduledAt,
            doctorName,
            doctorSpecialization: "General",
            delayMs: 2000,
          });
        } catch (emailErr) {
          console.error("[tickets] Failed to schedule appointment confirmation email:", emailErr);
        }
      }
    }
    if (body.rescheduleAppointment === true && body.appointmentTime) {
      if (!isVetOrDoctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAssignedToMe) return NextResponse.json({ error: "Assign the consultation to yourself first" }, { status: 403 });
      const rescheduleMessages = Array.isArray(ticket.messages) ? ticket.messages : [];
      const hasMedicineReschedule = rescheduleMessages.some((m: { from?: string; text?: string }) => m.from === "vet" && (m.text ?? "").startsWith("Medicine recommended:"));
      if (hasMedicineReschedule) return NextResponse.json({ error: "Cannot reschedule appointment after medicine has been recommended" }, { status: 400 });
      const scheduledAt = new Date(body.appointmentTime);
      update.appointment = {
        ...(typeof ticket.appointment === "object" && ticket.appointment !== null ? ticket.appointment : {}),
        scheduledAt,
        type: "physical",
        doctorId: session.userId,
      };
      await db.collection("appointments").updateOne(
        { ticketId: id },
        { $set: { scheduledAt, updatedAt: new Date() } }
      );
      await notifCol.insertOne({
        userId: patientId,
        ticketId: id,
        type: "appointment_scheduled",
        title: "Appointment rescheduled",
        body: `Your appointment is now scheduled for ${scheduledAt.toLocaleString()}`,
        read: false,
        createdAt: new Date(),
      });
      if (process.env.EMAIL_TO) {
        try {
          const doctorUser = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
          const doctorName = (doctorUser as { name?: string; username?: string })?.name ?? (doctorUser as { username?: string })?.username ?? "Your vet";
          await scheduleAppointmentEmail({
            patientName: (ticket as { patientName?: string }).patientName ?? "Patient",
            patientEmail: process.env.EMAIL_TO,
            appointmentDatetime: scheduledAt,
            doctorName,
            doctorSpecialization: "General",
            delayMs: 2000,
          });
        } catch (emailErr) {
          console.error("[tickets] Failed to schedule appointment confirmation email:", emailErr);
        }
      }
    }

    if (Object.keys(update).length === 0) {
      const t = await col.findOne({ _id: oid });
      return NextResponse.json({ ...t, _id: String(t!._id) });
    }

    // Follow-up email: use value from request (doctor dashboard) or fall back to env
    const followUpScheduleRaw =
      (typeof body.followUpEmailScheduledAt === "string" ? body.followUpEmailScheduledAt.trim() : null) ||
      process.env.FOLLOW_UP_EMAIL_SCHEDULED_AT?.trim() ||
      "";
    if (update.status === "closed" && followUpScheduleRaw) {
      try {
        const closedAt = (update.closedAt as Date) ?? new Date();
        const scheduledAt = parseFollowUpSchedule(followUpScheduleRaw, closedAt);
        if (scheduledAt) {
          const patientName = (ticket as { patientName?: string }).patientName ?? "Patient";
          const appointment = (ticket as { appointment?: { scheduledAt?: string; type?: string } }).appointment;
          const appointmentDate = appointment?.scheduledAt ? new Date(appointment.scheduledAt) : undefined;
          let doctorName: string | undefined;
          let doctorSpecialization: string | undefined;
          if (session.userId) {
            const doctorUser = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
            const u = doctorUser as { name?: string; username?: string; specialization?: string } | null;
            doctorName = u?.name ?? u?.username ?? "Your vet";
            doctorSpecialization = u?.specialization ?? "General";
          }
          const followUpWarningMessage =
            typeof body.followUpWarningMessage === "string" ? body.followUpWarningMessage.trim() : undefined;
          await scheduleFollowUpEmail({
            patientName,
            scheduledAt,
            appointmentDate: appointmentDate && !Number.isNaN(appointmentDate.getTime()) ? appointmentDate : undefined,
            doctorName,
            doctorSpecialization,
            warningMessage: followUpWarningMessage || undefined,
          });
        }
      } catch (emailErr) {
        console.error("[tickets] Failed to schedule follow-up email:", emailErr);
      }
    }

    await col.updateOne({ _id: oid }, { $set: update });
    const updated = await col.findOne({ _id: oid });
    return NextResponse.json({ ...updated, _id: String(updated!._id) });
  } catch (e) {
    console.error("PATCH /api/tickets/[id]:", e);
    return NextResponse.json({ error: "Failed to update consultation" }, { status: 500 });
  }
}
