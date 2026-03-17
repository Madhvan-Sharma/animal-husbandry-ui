import { useStreamContext, Message } from "@/providers/Stream";
import { useState } from "react";
import { getContentString } from "../utils";
import { Textarea } from "@/components/ui/textarea";
import { CommandBar } from "./shared";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";

function EditableContent({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-0"
    />
  );
}

export function HumanMessage({
  message,
  isLoading,
}: {
  message: Message;
  isLoading: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const contentString = getContentString(message.content);

  const handleSubmitEdit = () => {
    setIsEditing(false);
    // Note: Edit functionality would need to be implemented in Stream provider
    // For now, this is a placeholder
  };

  const patientLabel = (process.env.NEXT_PUBLIC_FIRST_NAME ?? "").trim() || "You";

  return (
    <div className="group flex w-full items-start gap-2">
      <div className="flex w-full max-w-2xl flex-col gap-0">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/90 mb-2.5">
          {patientLabel}
        </p>
        {isEditing ? (
          <EditableContent
            value={value}
            setValue={setValue}
            onSubmit={handleSubmitEdit}
          />
        ) : (
          <>
            {/* Render images and files */}
            {Array.isArray(message.content) && message.content.length > 0 && (
              <div className="flex flex-wrap items-end gap-2 mb-2">
                {message.content.reduce<React.ReactNode[]>(
                  (acc, block, idx) => {
                    if (isBase64ContentBlock(block)) {
                      acc.push(
                        <MultimodalPreview
                          key={idx}
                          block={block}
                          size="lg"
                        />,
                      );
                    }
                    return acc;
                  },
                  [],
                )}
              </div>
            )}
            {/* Render text if present */}
            {contentString ? (
              <div className="text-[15px] leading-[1.7]">
                <div className="rounded-lg bg-muted/30 px-4 py-3 text-left">
                  <p className="text-foreground/95 whitespace-pre-wrap">
                    {contentString}
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
        {(contentString || isEditing) && (
          <div className="flex items-center gap-2 mt-2">
            <CommandBar
              isLoading={isLoading}
              content={contentString}
              isEditing={isEditing}
              setIsEditing={(c) => {
                if (c) {
                  setValue(contentString);
                }
                setIsEditing(c);
              }}
              handleSubmitEdit={handleSubmitEdit}
              isHumanMessage={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
