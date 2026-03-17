import { Message } from "@/providers/Stream";

export const DO_NOT_RENDER_ID_PREFIX = "do-not-render-";

// Simplified version - tool calls are not used in VetAI
export function ensureToolCallsHaveResponses(messages: Message[]): Message[] {
  // Return empty array as Langflow doesn't use tool calls in the same way
  return [];
}
