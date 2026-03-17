import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getApiKey } from "@/lib/api-key";
import { toast } from "sonner";
import {
  ContentBlock,
  base64ToBlob,
} from "@/lib/multimodal-utils";
import { getBackendApiBase } from "@/lib/backend-api";
import { fetchEventSource } from "@microsoft/fetch-event-source";

type ChatHistoryItem = { role: "user" | "assistant"; content: string };

// Simplified message type for Langflow
export interface Message {
  id: string;
  type: "human" | "ai";
  content: string | (string | ContentBlock)[];
  terminal?: boolean;
  node_type?: string;
  condition?: string;
  skippedSteps?: SkippedStep[];
}

export interface SkippedStep {
  question: string;
  label: string;
  timestamp: string;
}

export interface StateType {
  messages: Message[];
}

interface StreamContextType {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  submit: (input: string, contentBlocks?: ContentBlock[], sessionId?: string) => Promise<void>;
  stop: () => void;
  /** Always set when the session starts (new UUID per session). Use as chat/diagnosis session identifier. */
  sessionId: string;
  setSessionId: (id: string | null) => void;
  graphId: string | null;
  setGraphId: (id: string | null) => void;
  graphName: string | null;
  setGraphName: (name: string | null) => void;
  isTerminal: boolean;
  availableGraphs: { graph_id: string; name: string }[];
  setAvailableGraphs: (graphs: { graph_id: string; name: string }[]) => void;
  /** Workflow/graph state (used when a workflow is selected). No workflow selected = {}. */
  values: Record<string, unknown>;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

const StreamSession = ({
  children,
  apiKey,
}: {
  children: ReactNode;
  apiKey: string | null;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        window.localStorage.setItem("chatSessionId", id);
      } else {
        window.localStorage.removeItem("chatSessionId");
      }
    }
  }, []);
  const [graphId, setGraphId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("selectedGraphId") || null;
  });
  const [graphName, setGraphName] = useState<string | null>(null);
  const [isTerminal, setIsTerminal] = useState(false);
  const [availableGraphs, setAvailableGraphs] = useState<{ graph_id: string; name: string }[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // When a workflow session was just created, show the session's initial question as the first AI message
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initialQuestion = window.sessionStorage.getItem("initialQuestion");
    if (!initialQuestion?.trim()) return;
    const storedGraphId = window.sessionStorage.getItem("selectedGraphId");
    if (!storedGraphId) return;
    setMessages([
      {
        id: crypto.randomUUID(),
        type: "ai",
        content: initialQuestion.trim(),
      },
    ]);
    window.sessionStorage.removeItem("initialQuestion");
  }, []);

  // Ensure we have a sessionId persisted across reloads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bootstrap = async () => {
      try {
        const existing = window.localStorage.getItem("chatSessionId");
        if (existing) {
          setSessionIdState(existing);
          return;
        }
        const res = await fetch("/api/sessions", { method: "POST" });
        if (!res.ok) {
          throw new Error("Failed to create chat session");
        }
        const data = (await res.json()) as { sessionId?: string };
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }
      } catch (error) {
        console.error("Failed to initialise chat session:", error);
      }
    };
    bootstrap();
  }, [setSessionId]);

  const submit = useCallback(
    async (input: string, contentBlocks: ContentBlock[] = [], _currentSessionId?: string) => {
      if (isLoading) return;

      let humanMessageContent: string | (string | ContentBlock)[];
      if (contentBlocks.length > 0) {
        humanMessageContent = input.trim()
          ? [input.trim(), ...contentBlocks]
          : contentBlocks;
      } else {
        humanMessageContent = input.trim();
      }

      const humanMessage: Message = {
        id: crypto.randomUUID(),
        type: "human",
        content: humanMessageContent,
      };

      setMessages((prev) => [...prev, humanMessage]);
      setIsLoading(true);
      setError(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Persist the user message for this session, if we have a sessionId.
        if (sessionId) {
          try {
            await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "user",
                content:
                  typeof humanMessage.content === "string"
                    ? humanMessage.content
                    : humanMessage.content
                        .map((c) =>
                          typeof c === "string"
                            ? c
                            : c.type === "image"
                            ? "[image]"
                            : "",
                        )
                        .join(" "),
              }),
            });
          } catch (err) {
            console.error("Failed to persist user message:", err);
          }
        }

        const backendApiBase = getBackendApiBase();
        const endpoint = `${backendApiBase}/api/v1/chat/stream`;

        const aiMessageId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          {
            id: aiMessageId,
            type: "ai",
            content: "",
          },
        ]);

        const formData = new FormData();
        formData.append("user_input", input.trim());

        // Provide conversation memory to the backend (so GPT can keep context).
        // Keep it lightweight: last 24 messages (including this human message).
        const history: ChatHistoryItem[] = [...messages, humanMessage]
          .slice(-24)
          .map((m) => ({
            role: m.type === "human" ? "user" : "assistant",
            content:
              typeof m.content === "string"
                ? m.content
                : m.content
                    .map((c) =>
                      typeof c === "string"
                        ? c
                        : c.type === "image"
                          ? "[image]"
                          : "",
                    )
                    .join(" ")
                    .trim(),
          }))
          .filter((m) => m.content.length > 0);
        formData.append("history_json", JSON.stringify(history));

        const firstImage = contentBlocks.find((block) => block.type === "image");
        if (firstImage && firstImage.type === "image") {
          const blob = base64ToBlob(firstImage.data, firstImage.mimeType);
          const filename =
            firstImage.metadata?.name ||
            firstImage.metadata?.filename ||
            `image.${firstImage.mimeType.split("/")[1] || "png"}`;
          formData.append("image", blob, filename);
        }

        let fullAnswer = "";

        await fetchEventSource(endpoint, {
          method: "POST",
          headers: {
            ...(apiKey && { "x-api-key": apiKey }),
          },
          body: formData,
          signal: abortController.signal,
          onmessage(ev) {
            const raw = ev.data;
            const marker = raw.trim();
            if (marker === "[DONE]") {
              // fetchEventSource will close after this handler returns
              return;
            }
            if (marker.startsWith("[ERROR]")) {
              const msg = marker.replace(/^\[ERROR\]\s*/, "");
              throw new Error(msg || "Streaming error from backend");
            }

            // Backend sends JSON events: {"token":"..."} (newline-safe). Fall back to raw text.
            let token = raw;
            try {
              const parsed = JSON.parse(raw) as { token?: unknown };
              if (typeof parsed?.token === "string") {
                token = parsed.token;
              }
            } catch {
              // ignore
            }

            // Preserve spaces exactly as streamed
            fullAnswer += token;
            const current = fullAnswer;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMessageId ? { ...m, content: current } : m
              )
            );
          },
          onerror(err) {
            throw err;
          },
        });

        const finalAnswer = fullAnswer.trim() || "No response received.";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId
              ? { ...m, content: finalAnswer, terminal: true }
              : m
          )
        );
        // Persist assistant message.
        if (sessionId) {
          try {
            await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "assistant",
                content: finalAnswer,
              }),
            });
          } catch (err) {
            console.error("Failed to persist assistant message:", err);
          }
        }
        setIsTerminal(true);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        toast.error("Failed to get response from backend", {
          description: error.message,
          duration: 5000,
          richColors: true,
          closeButton: true,
        });
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [apiKey, isLoading, sessionId, messages]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  return (
    <StreamContext.Provider
      value={{
        messages,
        isLoading,
        error,
        submit,
        stop,
        sessionId: sessionId ?? "",
        setSessionId,
        graphId,
        setGraphId,
        graphName,
        setGraphName,
        isTerminal,
        availableGraphs,
        setAvailableGraphs,
        values: {},
      }}
    >
      {children}
    </StreamContext.Provider>
  );
};

export const StreamProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const apiKey = getApiKey();

  return (
    <StreamSession apiKey={apiKey}>
      {children}
    </StreamSession>
  );
};

export const useStreamContext = () => {
  const context = useContext(StreamContext);
  if (!context) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};
