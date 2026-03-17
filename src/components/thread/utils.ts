import type { Message } from "@/providers/Stream";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Extract text strings from the array (first element if it's a string)
    const texts = content
      .filter((c): c is string => typeof c === "string")
      .map((c) => c);
    return texts.join(" ");
  }
  return String(content);
}

/**
 * Keywords that indicate the AI suggested requesting a consultation.
 * Read from .env.local: NEXT_PUBLIC_CONSULTATION_SUGGESTION_KEYWORDS (comma-separated).
 */
function getConsultationSuggestionKeywords(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_CONSULTATION_SUGGESTION_KEYWORDS ?? "ticket,consultation,consult";
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true if the message content contains any consultation-suggestion keyword.
 * Used to show the "Request Consultation" action next to the copy button on AI messages.
 */
export function contentSuggestsConsultation(content: string): boolean {
  if (!content || typeof content !== "string") return false;
  const lower = content.toLowerCase();
  const keywords = getConsultationSuggestionKeywords();
  return keywords.some((keyword) => lower.includes(keyword));
}
