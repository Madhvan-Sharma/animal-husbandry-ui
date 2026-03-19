import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/auth-server";
import { scheduleTicketCreatedEmail } from "@/lib/scheduler";

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
    // ~3MB base64 payload max per image (roughly 2.25MB binary).
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

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function severityRank(s: string | undefined): number {
  return SEVERITY_ORDER[s?.toLowerCase() ?? "medium"] ?? 2;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const forVet = searchParams.get("forVet") === "1" || searchParams.get("forDoctor") === "1";

    const session = await getSessionFromRequest();

    const db = await getDb();
    const col = db.collection("tickets");

    // Admin: return all tickets when no userId is specified and not a vet-specific query.
    if (!userId && !forVet && session?.role === "admin") {
      const tickets = await col
        .find({})
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      return NextResponse.json(
        tickets.map((t) => ({
          ...t,
          _id: String(t._id),
        })),
      );
    }

    if (forVet && (session?.role === "vet" || session?.role === "doctor")) {
      // Only show tickets assigned to this vet.
      const vetId = session.userId;
      const tickets = await col
        .find({ assignedDoctorId: vetId })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
      const withSeverity = tickets.map((t) => ({
        ...t,
        _id: String(t._id),
        severity: t.severity ?? "medium",
      }));
      withSeverity.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
      return NextResponse.json(withSeverity);
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const tickets = await col
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(
      tickets.map((t) => ({
        ...t,
        _id: String(t._id),
      }))
    );
  } catch (e) {
    console.error("GET /api/tickets:", e);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      symptoms,
      animalType,
      diagnosis,
      patientName,
      patientAge,
      patientGender,
      email,
      phone,
      address,
      city,
      state,
      zip,
      country,
      patientId,
      severity,
      attachments,
    } = body as {
      userId?: string;
      symptoms?: string[];
      animalType?: string;
      diagnosis?:
        | string
        | {
            symptoms?: string[];
            durationOfSymptoms?: string;
            relevantMessages?: string[];
          }
        | null;
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      patientId?: string;
      severity?: string;
      attachments?: unknown;
    };

    if (!userId || !address) {
      return NextResponse.json(
        { error: "userId and address are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const col = db.collection("tickets");

    const severityVal =
      severity && ["low", "medium", "high", "critical"].includes(severity.toLowerCase())
        ? severity.toLowerCase()
        : "medium";

    // Normalise diagnosis into a text blob (backwards-compatible with existing parseAiDiagnosis).
    let diagnosisText = "";
    if (typeof diagnosis === "string") {
      diagnosisText = diagnosis;
    } else if (diagnosis && typeof diagnosis === "object") {
      const lines: string[] = [];
      if (Array.isArray(diagnosis.symptoms) && diagnosis.symptoms.length) {
        lines.push(`Symptoms: [${diagnosis.symptoms.map((s) => `"${s}"`).join(", ")}]`);
      }
      if (diagnosis.durationOfSymptoms) {
        lines.push(`DurationOfSymptoms: ${diagnosis.durationOfSymptoms}`);
      }
      if (Array.isArray(diagnosis.relevantMessages) && diagnosis.relevantMessages.length) {
        lines.push(
          `RelevantMessages: [${diagnosis.relevantMessages
            .map((s) => `"${s}"`)
            .join(", ")}]`,
        );
      }
      diagnosisText = lines.join("\n");
    }
    const doc = {
      userId,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      diagnosis: diagnosisText,
      animalType: animalType != null ? String(animalType) : "",
      patientName: patientName != null ? String(patientName) : "",
      patientAge: patientAge != null ? String(patientAge) : "",
      patientGender: patientGender != null ? String(patientGender) : "",
      email: email != null ? String(email) : "",
      phone: phone != null ? String(phone) : "",
      address: String(address),
      city: city != null ? String(city) : "",
      state: state != null ? String(state) : "",
      zip: zip != null ? String(zip) : "",
      country: country != null ? String(country) : "",
      patientId: patientId != null ? String(patientId) : "",
      severity: severityVal,
      status: "open",
      messages: [],
      docRequests: [],
      attachments: sanitizeImageAttachments(attachments),
      // Tickets start unassigned; admins assign them to a doctor explicitly.
      assignedDoctorId: null,
      createdAt: new Date(),
    };

    const result = await col.insertOne(doc);
    const ticketId = String(result.insertedId);

    try {
      await scheduleTicketCreatedEmail({
        urn: ticketId,
        patientName: doc.patientName,
        patientAge: doc.patientAge || undefined,
        patientGender: doc.patientGender || undefined,
        email: doc.email || undefined,
        phone: doc.phone || undefined,
        address: doc.address,
        city: doc.city || undefined,
        state: doc.state || undefined,
        zip: doc.zip || undefined,
        country: doc.country || undefined,
        severity: doc.severity,
        symptoms: Array.isArray(doc.symptoms) ? doc.symptoms.join(", ") : (doc.symptoms ?? undefined),
        clinicalNotes: doc.diagnosis || undefined,
        createdAt: doc.createdAt,
        delayMs: 2000,
      });
    } catch (emailErr) {
      console.error("[tickets] Failed to schedule ticket-created email:", emailErr);
    }

    return NextResponse.json({
      ...doc,
      _id: ticketId,
    });
  } catch (e) {
    console.error("POST /api/tickets:", e);
    return NextResponse.json(
      { error: "Failed to create consultation" },
      { status: 500 }
    );
  }
}
