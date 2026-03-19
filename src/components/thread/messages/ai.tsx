"use client";

import { Message } from "@/providers/Stream";
import { getContentString, contentSuggestsConsultation } from "../utils";
import { CommandBar } from "./shared";
import { cn } from "@/lib/utils";
import { useCreateTicketOptional } from "../CreateTicketContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function AssistantMessage({
  message,
  isLoading,
}: {
  message: Message;
  isLoading: boolean;
}) {
  const raw = getContentString(message.content);
  const isEmpty = !raw || raw.length === 0;
  const suggestsConsultation = contentSuggestsConsultation(raw ?? "");
  const createTicket = useCreateTicketOptional();

  // Remove the internal marker so the user never sees it (still usable for UI trigger).
  const displayRaw = (raw ?? "").replace(/<<TICKET_REQUIRED>>/g, "").trim();
  // Convert literal \n in API output to actual newlines, then fix concatenated bold
  const contentString =
    displayRaw
      ?.replace(/\\r\\n|\\n|\\r/g, "\n")
      .replace(/([.:)])\s*(\*{2,3})(?=[A-Z])/g, "$1\n\n$2")
      .replace(/(\*{3})\s*(\*{3})(?=[A-Z])/g, "$1\n\n$2") ?? "";

  return (
    <div className="group flex w-full items-start gap-2">
      <div className="flex w-full max-w-2xl flex-col gap-0">
        {isEmpty && isLoading ? (
          <AssistantMessageLoading />
        ) : contentString.length > 0 ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/90 mb-2.5">
              VetAI
            </p>
            <div className="markdown-content">
            <div className="text-[15px] leading-[1.7]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {contentString}
              </ReactMarkdown>
            </div>
          </div>
          </>
        ) : null}
        {!isEmpty && (
            <div className="flex items-center gap-2 mt-2">
            <CommandBar
              content={raw}
              isLoading={isLoading}
              isAiMessage={true}
              showRequestConsultation={suggestsConsultation && !!createTicket}
              onRequestConsultation={createTicket?.openCreateTicket}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-0">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/90 mb-2.5">
        VetAI
      </p>
      <div className="flex items-center gap-3 min-h-[52px]">
        <div className="flex gap-1.5">
          <div className="bg-primary/60 h-2 w-2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full" />
          <div className="bg-primary/60 h-2 w-2 animate-[pulse_1.2s_ease-in-out_0.4s_infinite] rounded-full" />
          <div className="bg-primary/60 h-2 w-2 animate-[pulse_1.2s_ease-in-out_0.8s_infinite] rounded-full" />
        </div>
        <span className="text-sm text-muted-foreground">Preparing response...</span>
      </div>
    </div>
  );
}
