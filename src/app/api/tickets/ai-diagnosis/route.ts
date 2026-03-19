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
You are a veterinary assistant AI for an animal husbandry platform.

Your task: extract "AI-suggested symptoms" from the assistant's own medical reasoning (i.e. what the AI concluded/identified as symptoms from the conversation).

Given the following chat history, prioritize the **latest ASSISTANT message** as the primary source of truth.
If there is no assistant message, fall back to the owner's messages.

Return a JSON object with:

- "symptoms": an array of **concise, medically relevant symptom phrases** the patient clearly mentioned (for example: "reduced feed intake", "fever", "laboured breathing", "swollen udder").
  - These should be symptoms/signs the ASSISTANT identified or discussed as relevant (can be inferred/structured by the assistant).
  - Do NOT include vague impressions like "looks not normal", "seems off", "something is wrong".
  - Each item must be a specific clinical sign or symptom phrase, not a full sentence.
- "durationOfSymptoms": a short string describing how long the symptoms have been present (for example: "3 days", "since yesterday evening").
  - If the duration is unclear, use an empty string "".
- "relevantMessages": an array of short, passive **paraphrases derived ONLY from USER messages** that capture medically relevant info (symptoms, duration, appetite, milk yield, behaviour changes).
  - Do NOT quote the user verbatim.
  - Phrase each item like a neutral note, e.g. "User's cow feels lazy", "User reports reduced appetite", "User noticed swelling near the udder".
  - Do NOT include greetings or generic chat.
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

    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const userMessages = messages.filter((m) => m.role === "user");

    // Primary input: the assistant's latest message (what the AI concluded).
    // Fallback: the user's messages (so the feature still works when assistant text isn't stored).
    const primaryText =
      assistantMessages.length > 0
        ? assistantMessages[assistantMessages.length - 1]!.content
        : userMessages.map((m) => m.content).join("\n");

    const userText = userMessages.map((m) => m.content).join("\n");

    // Include full history as context (optional), but keep the "primary" section prominent.
    const historyText = messages
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
          content:
            `Assistant answer (primary for symptoms):\n${primaryText}\n\n` +
            `User messages (ONLY source for relevantMessages):\n${userText}\n\n` +
            `Full chat history (context):\n${historyText}`,
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

