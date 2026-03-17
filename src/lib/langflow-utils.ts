/**
 * Extract message text from a Langflow run API response.
 * Handles the nested structure used by both chat and diagnosis workflows.
 */
export function extractLangflowMessageText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;

  const outputs = d.outputs;
  if (!Array.isArray(outputs) || outputs.length === 0) return "";

  const firstOutput = outputs[0] as Record<string, unknown>;
  const inner = firstOutput?.outputs;
  if (!Array.isArray(inner) || inner.length === 0) return "";

  const firstInner = inner[0] as Record<string, unknown>;

  if (firstInner.results && typeof firstInner.results === "object") {
    const results = firstInner.results as Record<string, unknown>;
    const msg = results.message as Record<string, unknown> | undefined;
    if (msg?.data && typeof msg.data === "object") {
      const text = (msg.data as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
    const text = msg?.text;
    if (typeof text === "string") return text;
  }

  const artifacts = firstInner.artifacts as Record<string, unknown> | undefined;
  if (artifacts?.message && typeof artifacts.message === "string")
    return artifacts.message;

  const messages = firstInner.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const m = messages[0] as Record<string, unknown>;
    if (typeof m?.message === "string") return m.message;
  }

  const out = firstInner.outputs as Record<string, unknown> | undefined;
  const msg = out?.message as Record<string, unknown> | undefined;
  if (msg?.message && typeof msg.message === "string") return msg.message;

  return "";
}
