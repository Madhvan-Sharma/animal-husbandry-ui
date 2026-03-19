"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Ticket as TicketIcon,
  MessageSquare,
  FileText,
  Pill,
  CalendarCheck,
  XCircle,
  User,
  ClipboardList,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { fileToContentBlock, type ContentBlock } from "@/lib/multimodal-utils";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";

export interface TicketForActions {
  _id: string;
  ticketCategory?: string;
  status?: string;
  createdAt: string;
  closedAt?: string | null;
  messages?: { from: string; text: string; createdAt?: string }[];
  docRequests?: { type: string; requestedAt?: string; fulfilledAt?: string | null }[];
  appointment?: { scheduledAt: string; type?: string };
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  severity?: string;
  symptoms?: string[];
  animalType?: string;
  diagnosis?: string;
  attachments?: ContentBlock[];
}

type TimelineEvent = {
  type: "created" | "vet_message" | "doc_request" | "medicine" | "appointment" | "closed";
  date: Date;
  label: string;
  detail?: string;
  meta?: string;
};

function buildTimeline(ticket: TicketForActions): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    type: "created",
    date: new Date(ticket.createdAt),
    label: "Ticket created",
    detail: ticket.patientName ? `Case for ${ticket.patientName}` : undefined,
  });

  const messages = ticket.messages ?? [];
  for (const m of messages) {
    if (m.from !== "vet" && m.from !== "doctor") continue;
    const isMedicine = m.text.startsWith("Medicine recommended:");
    const date = m.createdAt ? new Date(m.createdAt) : new Date(0);
    if (isMedicine) {
      events.push({
        type: "medicine",
        date,
        label: "Medicine recommended",
        detail: m.text.replace(/^Medicine recommended:\s*/i, "").trim(),
      });
    } else {
      events.push({
        type: "vet_message",
        date,
        label: "Vet replied",
        detail: m.text,
      });
    }
  }

  const docRequests = ticket.docRequests ?? [];
  for (const d of docRequests) {
    const date = d.requestedAt ? new Date(d.requestedAt) : new Date(ticket.createdAt);
    events.push({
      type: "doc_request",
      date,
      label: "Document requested",
      detail: d.type,
      meta: d.fulfilledAt ? "Fulfilled" : "Pending",
    });
  }

  if (ticket.appointment?.scheduledAt) {
    events.push({
      type: "appointment",
      date: new Date(ticket.appointment.scheduledAt),
      label: "Appointment scheduled",
      detail: new Date(ticket.appointment.scheduledAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });
  }

  if (ticket.closedAt && (ticket.status ?? "").toLowerCase() === "closed") {
    events.push({
      type: "closed",
      date: new Date(ticket.closedAt),
      label: "Consultation closed",
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

const eventConfig: Record<
  TimelineEvent["type"],
  { icon: React.ElementType; color: string; bg: string }
> = {
  created: {
    icon: TicketIcon,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
  },
  vet_message: {
    icon: MessageSquare,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/30",
  },
  doc_request: {
    icon: FileText,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  medicine: {
    icon: Pill,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  appointment: {
    icon: CalendarCheck,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
  closed: {
    icon: XCircle,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
  },
};

interface TicketVetActionsModalProps {
  ticket: TicketForActions | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketVetActionsModal({
  ticket,
  open,
  onOpenChange,
}: TicketVetActionsModalProps) {
  const ticketId = ticket?._id ?? "";
  const [attachments, setAttachments] = useState<ContentBlock[]>(
    Array.isArray(ticket?.attachments) ? (ticket?.attachments as ContentBlock[]) : [],
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAttachments(Array.isArray(ticket?.attachments) ? (ticket?.attachments as ContentBlock[]) : []);
  }, [ticketId, ticket?.attachments]);

  if (!ticket) return null;

  const handleAddImages = async (files: File[]) => {
    if (files.length === 0) return;
    if (uploading) return;
    setUploading(true);
    try {
      const blocks = await Promise.all(files.slice(0, 8).map((f) => fileToContentBlock(f)));
      const res = await fetch(`/api/tickets/${ticket._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addImages: blocks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to upload images");
      }
      const updated = Array.isArray((data as { attachments?: unknown }).attachments)
        ? ((data as { attachments?: ContentBlock[] }).attachments ?? [])
        : [...attachments, ...blocks];
      setAttachments(updated);
      toast.success(`Added ${blocks.length} image${blocks.length === 1 ? "" : "s"} to the ticket`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload images");
    } finally {
      setUploading(false);
    }
  };

  const events = buildTimeline(ticket);

  const statusLabel = (ticket.status ?? "open").replace(/_/g, " ");
  const severityColors: Record<string, string> = {
    critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  };
  const severityClass = severityColors[(ticket.severity ?? "medium").toLowerCase()] ?? severityColors.medium;
  const categoryLabel =
    (ticket.ticketCategory ?? "general") === "artificial_insemination"
      ? "Artificial Insemination"
      : "General";
  const categoryClass =
    (ticket.ticketCategory ?? "general") === "artificial_insemination"
      ? "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400"
      : "border-slate-400/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] min-h-[480px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <TicketIcon className="size-5 text-muted-foreground" />
              Ticket details & vet actions
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <XCircle className="size-5" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] min-h-0 overflow-hidden">
          {/* Left: Ticket details */}
          <div className="border-r border-border bg-muted/10 overflow-y-auto flex flex-col">
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                  <User className="size-3.5" />
                  Case
                </h3>
                <div className="rounded-xl border border-border bg-background/80 p-4 space-y-2">
                  <p className="font-semibold text-foreground">
                    {ticket.patientName || "—"}
                    {(ticket.patientAge || ticket.patientGender) && (
                      <span className="text-muted-foreground font-normal ml-2 text-sm">
                        {[ticket.patientAge, ticket.patientGender].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize", severityClass)}>
                      {ticket.severity ?? "medium"}
                    </span>
                    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", categoryClass)}>
                      {categoryLabel}
                    </span>
                    <span className="inline-flex rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(ticket.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>

              {(ticket.animalType || (ticket.symptoms?.length ?? 0) > 0) && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                    <ClipboardList className="size-3.5" />
                    Clinical
                  </h3>
                  <div className="rounded-xl border border-border bg-background/80 p-4 space-y-3">
                    {ticket.animalType && (
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Animal</p>
                        <p className="text-sm font-medium capitalize">{ticket.animalType}</p>
                      </div>
                    )}
                    {(ticket.symptoms?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Symptoms</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ticket.symptoms!.map((s) => (
                            <span key={s} className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ImageIcon className="size-3.5" />
                    Images
                  </h3>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      await handleAddImages(files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="size-3.5 mr-1.5" />
                    Add
                  </Button>
                </div>
                <div className="rounded-xl border border-border bg-background/80 p-4">
                  {attachments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No images attached yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((b, idx) => (
                        <MultimodalPreview key={idx} block={b} size="md" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Right: Flow / timeline */}
          <div className="overflow-y-auto flex flex-col min-h-0">
            <div className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Vet actions flow</h3>
              <div className="relative">
                <div
                  className="absolute left-5 top-3 bottom-3 w-0.5 bg-gradient-to-b from-primary/40 via-primary/20 to-border rounded-full"
                  aria-hidden
                />
                <ul className="space-y-0">
                  {events.map((event, index) => {
                    const config = eventConfig[event.type];
                    const Icon = config.icon;
                    return (
                      <li
                        key={`${event.type}-${event.date.getTime()}-${index}`}
                        className="relative flex gap-4 pb-6"
                      >
                        <div
                          className={cn(
                            "relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 shadow-sm",
                            config.bg,
                            config.color
                          )}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5 pb-1">
                          <div className="rounded-lg border border-border bg-card/80 px-4 py-3 shadow-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-semibold text-foreground text-sm">
                                {event.label}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {event.date.toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {event.detail && (
                              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                                {event.detail}
                              </p>
                            )}
                            {event.meta && (
                              <span
                                className={cn(
                                  "inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-md",
                                  event.meta === "Fulfilled"
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                )}
                              >
                                {event.meta}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {events.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 px-6 text-center">
                    <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No vet actions yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Your ticket is waiting to be assigned.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
