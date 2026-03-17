import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const PROMPT_DIR = join(process.cwd(), "prompts");

type SuggestionType = "reply" | "request_document" | "recommend_medicine";

function getPrompt(type: SuggestionType): string {
  const files: Record<SuggestionType, string> = {
    reply: "vet-reply-to-patient.txt",
    request_document: "vet-request-document.txt",
    recommend_medicine: "vet-recommend-medicine.txt",
  };
  const path = join(PROMPT_DIR, files[type]);
  try {
    return readFileSync(path, "utf-8").trim();
  } catch (e) {
    console.error(`[vet-suggestion] Failed to read prompt ${path}:`, e);
    throw new Error(`Missing prompt file: ${files[type]}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const type = body?.type as SuggestionType | undefined;
    const diagnosis = typeof body?.diagnosis === "string" ? body.diagnosis : "";
    const symptoms = Array.isArray(body?.symptoms) ? body.symptoms : [];
    const animalType = typeof body?.animalType === "string" ? body.animalType : "";
    const messages =
      Array.isArray(body?.messages) && body.messages.every((m: unknown) => typeof m === "object" && m !== null && "from" in m && "text" in m)
        ? (body.messages as { from: string; text: string }[])
        : [];

    if (!type || !["reply", "request_document", "recommend_medicine"].includes(type)) {
      return NextResponse.json({ error: "type must be reply, request_document, or recommend_medicine" }, { status: 400 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }

    const systemPrompt = getPrompt(type);
    const contextParts: string[] = [];
    if (diagnosis) contextParts.push(`[Diagnosis / notes]\n${diagnosis}`);
    if (symptoms.length) contextParts.push(`[Symptoms]\n${symptoms.join(", ")}`);
    if (animalType) contextParts.push(`[Animal type]\n${animalType}`);
    if (messages.length) {
      contextParts.push(
        `[Conversation so far]\n${messages.map((m) => `${m.from}: ${m.text}`).join("\n")}`
      );
    }
    const userContent = contextParts.length ? contextParts.join("\n\n") : "No context provided.";

    // Use a capable model; set OPENAI_VET_SUGGESTION_MODEL for e.g. gpt-4o, gpt-4o-pro, or gpt-4-turbo
    const model =
      process.env.OPENAI_VET_SUGGESTION_MODEL ||
      process.env.OPENAI_DIAGNOSIS_MODEL ||
      "gpt-4o";

    const client = new OpenAI({ apiKey: openaiApiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
    }

    if (type === "reply") {
      return NextResponse.json({ reply: raw });
    }

    if (type === "request_document") {
      let parsed: { documents?: string[] };
      try {
        const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned) as { documents?: string[] };
      } catch {
        return NextResponse.json({ error: "Invalid JSON from model for request_document" }, { status: 502 });
      }
      const documents = Array.isArray(parsed.documents) ? parsed.documents.filter((d) => typeof d === "string" && d.trim()) : [];
      return NextResponse.json({ documents });
    }

    if (type === "recommend_medicine") {
      interface MedicineItem {
        name?: string;
        duration?: string;
      }
      let parsed: { medicines?: MedicineItem[] };
      try {
        const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned) as { medicines?: MedicineItem[] };
      } catch {
        return NextResponse.json({ error: "Invalid JSON from model for recommend_medicine" }, { status: 502 });
      }
      const rawMedicines = Array.isArray(parsed.medicines) ? parsed.medicines : [];
      const medicines = rawMedicines
        .filter((item) => item && (typeof item.name === "string" || typeof item.duration === "string"))
        .map((item) => ({
          name: typeof item.name === "string" ? item.name.trim() : "",
          duration: typeof item.duration === "string" ? item.duration.trim() : "",
        }))
        .filter((item) => item.name !== "" || item.duration !== "");
      return NextResponse.json({ medicines });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tickets/vet-suggestion:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
