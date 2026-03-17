"use client";

import React, { useState } from "react";
import { File, X as XIcon } from "lucide-react";
import { ContentBlock } from "@/lib/multimodal-utils";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export interface MultimodalPreviewProps {
  block: ContentBlock;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const MultimodalPreview: React.FC<MultimodalPreviewProps> = ({
  block,
  removable = false,
  onRemove,
  className,
  size = "md",
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Image block
  if (
    block.type === "image" &&
    typeof block.mimeType === "string" &&
    block.mimeType.startsWith("image/")
  ) {
    const url = `data:${block.mimeType};base64,${block.data}`;
    const alt = String(block.metadata?.name || "uploaded image");
    const sizeMap = {
      sm: { imgClass: "rounded-lg object-cover h-12 w-12", w: 48, h: 48 },
      md: { imgClass: "rounded-lg object-cover h-20 w-20", w: 80, h: 80 },
      lg: { imgClass: "rounded-lg object-cover h-28 w-28", w: 112, h: 112 },
    };
    const { imgClass, w, h } = sizeMap[size];
    return (
      <>
        <div className={cn("relative inline-block", className)}>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="cursor-pointer overflow-hidden rounded-lg ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src={url}
              alt={alt}
              className={imgClass}
              width={w}
              height={h}
            />
          </button>
          {removable && (
            <button
              type="button"
              className="absolute top-1 right-1 z-10 cursor-pointer rounded-full bg-gray-500 text-white hover:bg-gray-700 p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
              aria-label="Remove image"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-fit border-none bg-black/95 p-2">
            <DialogTitle className="sr-only">{alt}</DialogTitle>
            <img
              src={url}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] w-auto h-auto object-contain rounded"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // PDF block
  if (block.type === "file" && block.mimeType === "application/pdf") {
    const filename =
      block.metadata?.filename || block.metadata?.name || "PDF file";
    return (
      <div
        className={cn(
          "relative flex items-start gap-2 rounded-md border bg-gray-100 px-3 py-2",
          className,
        )}
      >
        <div className="flex flex-shrink-0 flex-col items-start justify-start">
          <File
            className={cn(
              "text-teal-700",
              size === "sm" ? "h-5 w-5" : "h-7 w-7",
            )}
          />
        </div>
        <span
          className={cn("min-w-0 flex-1 text-sm break-all text-gray-800")}
          style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
        >
          {String(filename)}
        </span>
        {removable && (
          <button
            type="button"
            className="ml-2 self-start cursor-pointer rounded-full bg-gray-200 p-1 text-teal-700 hover:bg-gray-300"
            onClick={onRemove}
            aria-label="Remove PDF"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-gray-100 px-3 py-2 text-gray-500",
        className,
      )}
    >
      <File className="h-5 w-5 flex-shrink-0" />
      <span className="truncate text-xs">Unsupported file type</span>
      {removable && (
        <button
          type="button"
          className="ml-2 cursor-pointer rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300"
          onClick={onRemove}
          aria-label="Remove file"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
