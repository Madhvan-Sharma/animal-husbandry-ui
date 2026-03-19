"use client";

import { Button } from "@/components/ui/button";
import {
  PanelRightOpen,
  PanelRightClose,
  TicketPlus,
  Pill,
  CalendarCheck,
  Stethoscope,
  Maximize2,
  FileText,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useState, useEffect, useCallback } from "react";
import { useCreateTicket } from "./CreateTicketContext";
import { getUserId } from "@/lib/user-id";
import { cn } from "@/lib/utils";
import { VetAILogoSVG } from "../icons/medcare";
import { TicketVetActionsModal } from "./TicketVetActionsModal";
import type { ContentBlock } from "@/lib/multimodal-utils";

interface Ticket {
  _id: string;
  ticketCategory?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  email?: string;
  phone?: string;
  patientId?: string;
  symptoms: string[];
  diagnosis?: string;
  severity?: string;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  animalType?: string;
  status?: string;
  messages?: { from: string; text: string; createdAt: string }[];
  docRequests?: { type: string; requestedAt?: string; fulfilledAt?: string | null }[];
  attachments?: ContentBlock[];
  appointment?: { scheduledAt: string; type: string };
  nextSteps?: string;
  closedAt?: string | null;
  createdAt: string;
}

export default function Sidebar() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [sidebarOpen, setSidebarOpen] = useQueryState(
    "sidebarOpen",
    parseAsBoolean.withDefault(false),
  );
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketForActionsModal, setTicketForActionsModal] = useState<Ticket | null>(null);
  const { openCreateTicket, registerOnTicketCreated } = useCreateTicket();

  const fetchTickets = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    setTicketsLoading(true);
    try {
      const res = await fetch(`/api/tickets?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    registerOnTicketCreated(fetchTickets);
  }, [registerOnTicketCreated, fetchTickets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    fetchTickets();
  }, [fetchTickets]);

  const SEVERITY_COLORS: Record<string, string> = {
    critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    low: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  };
  const severityClass = (s: string) => SEVERITY_COLORS[(s ?? "medium").toLowerCase()] ?? SEVERITY_COLORS.medium;

  const SidebarContent = () => (
    <div className="flex h-full min-h-0 w-full flex-col gap-5 overflow-y-auto p-4">
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-3.5">
        <div className="flex items-center justify-center">
          <VetAILogoSVG
            width={96}
            height={96}
            className="h-20 w-20"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button
          onClick={openCreateTicket}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          variant="default"
        >
          <TicketPlus className="mr-2 h-4 w-4" />
          Create Ticket
        </Button>
      </div>

      <div className="w-full space-y-3">
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5" />
            Tickets
          </div>
          {!ticketsLoading && tickets.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary tabular-nums">
              {tickets.length}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {ticketsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl bg-muted" />
            ))
          ) : tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 px-4 text-center">
              <TicketPlus className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No cases yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create one to get started</p>
            </div>
          ) : (
            tickets.map((t) => {
              const medicineMsg = t.messages?.find(
                (m) => m.from === "vet" && m.text.startsWith("Medicine recommended:")
              );
              const docRequests = t.docRequests ?? [];
              const hasAppointment = !!t.appointment?.scheduledAt;
              const statusLabel = t.status === "closed" ? "Closed" : t.status?.replace(/_/g, " ") ?? "Open";
              const categoryLabel =
                (t.ticketCategory ?? "general") === "artificial_insemination"
                  ? "Artificial Insemination"
                  : "General";
              const categoryClass =
                (t.ticketCategory ?? "general") === "artificial_insemination"
                  ? "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400"
                  : "border-slate-400/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";

              return (
                <div
                  key={t._id}
                  className="glass-panel min-w-0 w-full overflow-visible rounded-xl"
                >
                  <div className="p-3.5 space-y-2.5 min-w-0">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
                        {t.patientName && (
                          <span className="text-sm font-semibold text-foreground break-words">
                            {t.patientName}
                          </span>
                        )}
                        {(t.patientAge || t.patientGender) && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {[t.patientAge, t.patientGender].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider capitalize",
                          severityClass(t.severity ?? "medium")
                        )}
                      >
                        {t.severity ?? "medium"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2 min-w-0 text-[11px] text-muted-foreground">
                      <div className="min-w-0">
                        <div className="font-medium uppercase tracking-wider">{statusLabel}</div>
                        <div className="break-words min-w-0">
                          Created {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      <span className={cn("shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", categoryClass)}>
                        {categoryLabel}
                      </span>
                    </div>
                    {hasAppointment && t.appointment && (
                      <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-medium min-w-0">
                        <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-words min-w-0">
                          Appt: {new Date(t.appointment.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                    )}
                    {t.symptoms?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.symptoms.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {(medicineMsg || docRequests.length > 0 || hasAppointment) && (
                      <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5 space-y-2">
                        {medicineMsg && (
                          <div className="flex items-start gap-2 text-xs min-w-0">
                            <Pill className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                            <div className="min-w-0 flex-1 break-words">
                              <span className="font-medium text-foreground">Medicine recommended</span>
                              <p className="text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">
                                {medicineMsg.text.replace(/^Medicine recommended:\s*/i, "")}
                              </p>
                            </div>
                          </div>
                        )}
                        {docRequests.length > 0 && (
                          <div className="flex items-start gap-2 text-xs min-w-0">
                            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0 flex-1 break-words">
                              <span className="font-medium text-foreground">Document requested</span>
                              <ul className="text-muted-foreground mt-0.5 space-y-0.5">
                                {docRequests.map((d, i) => (
                                  <li key={i}>
                                    {d.type}
                                    {d.fulfilledAt ? (
                                      <span className="text-green-600 dark:text-green-400 ml-1">· Fulfilled</span>
                                    ) : (
                                      <span className="text-amber-600 dark:text-amber-400 ml-1">· Pending</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                        {hasAppointment && t.appointment && (
                          <div className="flex items-start gap-2 text-xs min-w-0">
                            <CalendarCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                            <div className="min-w-0 flex-1 break-words">
                              <span className="font-medium text-foreground">Appointment scheduled</span>
                              <p className="text-muted-foreground mt-0.5">
                                {new Date(t.appointment.scheduledAt).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => setTicketForActionsModal(t)}
                        aria-label="View ticket details and vet actions"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden h-screen w-[400px] shrink-0 flex flex-col items-stretch border-r border-border bg-sidebar/95 backdrop-blur-sm lg:flex">
        <div className="flex w-full shrink-0 items-center justify-between px-4 pt-1.5">
          <Button
            className="hover:bg-accent text-muted-foreground"
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((p) => !p)}
          >
            {sidebarOpen ? (
              <PanelRightOpen className="size-5" />
            ) : (
              <PanelRightClose className="size-5" />
            )}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </div>
      <div className="lg:hidden">
        <Sheet
          open={!!sidebarOpen && !isLargeScreen}
          onOpenChange={(open) => {
            if (isLargeScreen) return;
            setSidebarOpen(open);
          }}
        >
          <SheetContent
            side="left"
            className="flex h-full flex-col lg:hidden"
          >
            <SheetHeader className="shrink-0">
              <SheetTitle className="sr-only">Sidebar</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SidebarContent />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <TicketVetActionsModal
        ticket={ticketForActionsModal}
        open={!!ticketForActionsModal}
        onOpenChange={(open) => !open && setTicketForActionsModal(null)}
      />
    </>
  );
}
