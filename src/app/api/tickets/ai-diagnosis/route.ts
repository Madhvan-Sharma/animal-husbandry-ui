import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import OpenAI from "openai";

type ChatMessageDoc = {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

const PROMPT = `
You are a veterinary assistant AI for an animal husbandry platform. Given the following **owner chat history about their animal**, extract and return a JSON object with:

- "symptoms": an array of **concise, medically relevant symptom phrases** the patient clearly mentioned (for example: "reduced feed intake", "fever", "laboured breathing", "swollen udder").
  - Do NOT include vague impressions like "looks not normal", "seems off", "something is wrong", or purely visual/emotional descriptions.
  - Each item must be a specific clinical sign or symptom, not a full sentence.
- "durationOfSymptoms": a short string describing how long the symptoms have been present (for example: "3 days", "since yesterday evening").
  - If the duration is unclear, use an empty string "".
- "relevantMessages": an array of **direct quotes from the patient's own messages** that are medically relevant (symptoms, duration, changes in behaviour, appetite, milk yield, etc.).
  - Each item must be a **verbatim snippet** copied from the patient text, not paraphrased.
  - Do NOT include the assistant's messages or generic chat like greetings.
- "severity": a string describing how urgent/serious the condition appears to be based on the information provided.
  - Choose **exactly one** of: "low", "medium", "high", "critical".
  - "low" = mild, self-limiting signs, animal otherwise bright and eating.
  - "medium" = clear clinical signs but stable and not rapidly worsening.
  - "high" = worrying signs, significant pain or dysfunction, or worsening over time.
  - "critical" = life-threatening signs, collapse, severe respiratory distress, suspected poisoning, dystocia, or very rapid spread in the herd.
- "animalType": a short string describing the most likely type of animal the owner is talking about.
  - Use common names like "cow", "buffalo", "goat", "sheep", "pig", "chicken", etc.
  - If you truly cannot tell, use an empty string "".

Return ONLY raw JSON, no markdown, no explanation.
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const col = db.collection<ChatMessageDoc>("chat_messages");
    const messages = await col
      .find({ sessionId })
      .sort({ createdAt: 1 })
      .toArray();

    if (!messages.length) {
      return NextResponse.json(
        { error: "No messages found for this session" },
        { status: 404 },
      );
    }

    const userMessages = messages.filter((m) => m.role === "user");
    const historyText = (userMessages.length ? userMessages : messages)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const client = new OpenAI({ apiKey: openaiApiKey });
    // Use a chat-capable model. Default to gpt-5.4 (non-pro), but allow override via env.
    const diagnosisModel =
      process.env.OPENAI_DIAGNOSIS_MODEL ||
      "gpt-5.4";

    const completion = await client.chat.completions.create({
      model: diagnosisModel,
      messages: [
        { role: "system", content: PROMPT.trim() },
        {
          role: "user",
          content: `Chat history:\n${historyText}`,
        },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw || typeof raw !== "string") {
      return NextResponse.json(
        { error: "Empty response from OpenAI" },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to recover by trimming code fences if present
      const cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    const result = parsed as {
      symptoms?: string[];
      durationOfSymptoms?: string;
      relevantMessages?: string[];
      severity?: string;
      animalType?: string;
    };

    return NextResponse.json(
      {
        symptoms: Array.isArray(result.symptoms) ? result.symptoms : [],
        durationOfSymptoms:
          typeof result.durationOfSymptoms === "string"
            ? result.durationOfSymptoms
            : "",
        relevantMessages: Array.isArray(result.relevantMessages)
          ? result.relevantMessages
          : [],
        severity:
          typeof result.severity === "string"
            ? result.severity.toLowerCase()
            : "medium",
        animalType:
          typeof result.animalType === "string"
            ? result.animalType.trim()
            : "",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/tickets/ai-diagnosis:", error);
    return NextResponse.json(
      { error: "Failed to generate AI diagnosis" },
      { status: 500 },
    );
  }
}

