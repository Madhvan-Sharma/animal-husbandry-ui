"use client";

import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  ExternalLink,
  PanelRightOpen,
  PanelRightClose,
  TicketPlus,
  Pill,
  CalendarCheck,
  Stethoscope,
  FolderOpen,
  Tractor,
  Globe,
  Plus,
  Maximize2,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useState, useRef, useEffect, useCallback } from "react";
import { useCreateTicket } from "./CreateTicketContext";
import { getUserId } from "@/lib/user-id";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VetAILogoSVG } from "../icons/medcare";
import { Input } from "@/components/ui/input";
import { TicketVetActionsModal } from "./TicketVetActionsModal";

interface Ticket {
  _id: string;
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
  const ragUploadInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<
    {
      id: string;
      name: string;
      url: string;
      bytes: number;
      createdAt: string | null;
      format: string;
    }[]
  >([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [ragUrl, setRagUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
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

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const res = await fetch("/api/rag/documents");
      if (!res.ok) {
        setDocuments([]);
        return;
      }
      const data = (await res.json()) as {
        documents?: {
          id: string;
          name: string;
          url: string;
          bytes: number;
          createdAt: string | null;
          format: string;
        }[];
      };
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch {
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    registerOnTicketCreated(fetchTickets);
  }, [registerOnTicketCreated, fetchTickets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUploadClick = () => {
    ragUploadInputRef.current?.click();
  };

  const handleAddUrlToRag = async () => {
    const url = ragUrl.trim();
    if (!url) {
      toast.error("Please enter a URL.");
      return;
    }
    setAddingUrl(true);
    try {
      const res = await fetch("/api/rag/add-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to add URL to knowledge base.");
      } else {
        const chunks = typeof data.chunksAdded === "number" ? data.chunksAdded : undefined;
        toast.success(
          chunks != null
            ? `Website added — ${chunks} chunk${chunks === 1 ? "" : "s"} indexed.`
            : "Website added to knowledge base.",
        );
        setRagUrl("");
        // Optimistically add to local documents list so it is visible immediately.
        setDocuments((prev) => [
          {
            id: `url:${Date.now()}`,
            name: url,
            url,
            bytes: 0,
            createdAt: new Date().toISOString(),
            format: "url",
          },
          ...prev,
        ]);
        await fetchDocuments();
      }
    } catch {
      toast.error("Failed to add URL to knowledge base.");
    } finally {
      setAddingUrl(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    const nonPdf = files.filter((file) => file.type !== "application/pdf");
    if (nonPdf.length > 0) {
      toast.error("Only PDF files are supported for the knowledge base.");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    setUploadingDocuments(true);
    try {
      const res = await fetch("/api/rag/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || "Failed to upload documents.");
      } else {
        toast.success(`Added ${files.length} PDF${files.length > 1 ? "s" : ""} to knowledge base.`);
        await fetchDocuments();
      }
    } catch {
      toast.error("Failed to upload documents.");
    } finally {
      setUploadingDocuments(false);
      e.target.value = "";
    }
  };

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
        <Button
          onClick={handleUploadClick}
          className="w-full border-border font-medium"
          variant="outline"
          disabled={uploadingDocuments}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploadingDocuments ? "Adding PDFs…" : "Add PDFs to Knowledge base"}
        </Button>
        <input
          ref={ragUploadInputRef}
          type="file"
          onChange={handleFileChange}
          multiple
          accept="application/pdf"
          className="hidden"
        />
        <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Add website to knowledge base
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Paste a URL to index its content
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
            <Input
              type="url"
              placeholder="https://example.com/article"
              value={ragUrl}
              onChange={(e) => setRagUrl(e.target.value)}
              className="h-9 text-xs rounded-lg border-border bg-background/80 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/20"
              disabled={addingUrl}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!addingUrl && ragUrl.trim()) {
                    void handleAddUrlToRag();
                  }
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full h-9 text-xs font-medium rounded-lg gap-1.5 bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20"
              onClick={handleAddUrlToRag}
              disabled={addingUrl || !ragUrl.trim()}
            >
              {addingUrl ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Add to knowledge base
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="tickets" className="glass-panel w-full rounded-2xl p-3">
        <TabsList className="w-full grid grid-cols-3 h-10">
          <TabsTrigger value="tickets" className="gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Stethoscope className="h-3.5 w-3.5" />
            Tickets
            {!ticketsLoading && tickets.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-bold text-primary tabular-nums">
                {tickets.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <FolderOpen className="h-3.5 w-3.5" />
            Documents
            {!documentsLoading &&
              documents.filter((d) => d.format.toLowerCase() !== "url").length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {documents.filter((d) => d.format.toLowerCase() !== "url").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="urls" className="gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <FolderOpen className="h-3.5 w-3.5" />
            URLs
            {!documentsLoading &&
              documents.filter(
                (d) =>
                  d.format.toLowerCase() === "url" ||
                  d.id.startsWith("url:"),
              ).length > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500/20 px-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                  {
                    documents.filter(
                      (d) =>
                        d.format.toLowerCase() === "url" ||
                        d.id.startsWith("url:"),
                    ).length
                  }
                </span>
              )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-3 min-h-0">
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
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground min-w-0">
                      <span className="font-medium uppercase tracking-wider shrink-0">{statusLabel}</span>
                      <span className="break-words min-w-0">
                        Created {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
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
        </TabsContent>
        <TabsContent value="documents" className="mt-3 min-h-0">
          <div className="flex flex-col gap-2.5">
            {documentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-18 w-full rounded-lg bg-muted" />
              ))
            ) : documents.filter((d) => d.format.toLowerCase() !== "url").length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 px-4 text-center">
                <Tractor className="mx-auto h-7 w-7 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No PDFs in knowledge base yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add a PDF above to include it in the knowledge base
                </p>
              </div>
            ) : (
              documents
                .filter((doc) => doc.format.toLowerCase() !== "url")
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="glass-panel flex flex-col gap-2 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground break-words">
                          {doc.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {doc.createdAt
                            ? new Date(doc.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Uploaded recently"}
                        </p>
                      </div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </a>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {(doc.bytes / 1024 / 1024).toFixed(2)} MB · {doc.format.toUpperCase()}
                    </div>
                  </div>
                ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="urls" className="mt-3 min-h-0">
          <div className="flex flex-col gap-2.5">
            {documentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-18 w-full rounded-lg bg-muted" />
              ))
            ) : documents.filter(
                (d) =>
                  d.format.toLowerCase() === "url" ||
                  d.id.startsWith("url:"),
              ).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 px-4 text-center">
                <Tractor className="mx-auto h-7 w-7 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No URLs added yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paste a website URL above to add it to the knowledge base
                </p>
              </div>
            ) : (
              documents
                .filter(
                  (doc) =>
                    doc.format.toLowerCase() === "url" ||
                    doc.id.startsWith("url:"),
                )
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="glass-panel flex flex-col gap-2 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground break-words">
                          {doc.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {doc.createdAt
                            ? new Date(doc.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Added recently"}
                        </p>
                      </div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </a>
                    </div>
                  </div>
                ))
            )}
          </div>
        </TabsContent>
      </Tabs>
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
