"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, UserPlus, XCircle, Ticket, Users, BarChart3, PieChart as PieChartIcon, Eye, User, Mail, Phone, MapPin, ClipboardList, MessageSquare, FileText, Upload, Globe, ExternalLink } from "lucide-react";
import { LoggedInUser } from "@/components/auth/logged-in-user";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import type { ContentBlock } from "@/lib/multimodal-utils";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { parseAiDiagnosis, getDiagnosisFieldLabel } from "@/lib/parse-ai-diagnosis";

type TicketRow = {
  _id: string;
  userId: string;
  assignedDoctorId?: string | null;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  animalType?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  symptoms?: string[];
  diagnosis?: string;
  severity?: string;
  status?: string;
  messages?: { from: string; text: string; createdAt?: string }[];
  docRequests?: { type: string; requestedAt?: string; fulfilledAt?: string | null }[];
  attachments?: ContentBlock[];
  closedAt?: string | null;
  appointment?: { scheduledAt: string; type: string };
  createdAt: string;
};

type VetUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  email: string;
  specialization: string;
};

type RAGDocument = {
  id: string;
  name: string;
  url: string;
  bytes: number;
  createdAt: string | null;
  format: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [vets, setVets] = useState<VetUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [viewingTicket, setViewingTicket] = useState<TicketRow | null>(null);
  const [selectedVetId, setSelectedVetId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  const ragUploadInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [ragUrl, setRagUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  useEffect(() => {
    loadTickets();
    loadVets();
    fetchDocuments();
  }, []);

  async function loadTickets() {
    try {
      setLoading(true);
      const res = await fetch("/api/tickets");
      if (!res.ok) throw new Error("Failed to fetch tickets");
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (error) {
      setTickets([]);
      toast.error("Cannot load tickets");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadVets() {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setVets(list.filter((u: VetUser) => u.role === "vet" || u.role === "doctor"));
    } catch (_error) {
      setVets([]);
    }
  }

  async function fetchDocuments() {
    setDocumentsLoading(true);
    try {
      const res = await fetch("/api/rag/documents");
      if (!res.ok) {
        setDocuments([]);
        return;
      }
      const data = (await res.json()) as { documents?: RAGDocument[] };
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch {
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }

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
        toast.error((data as { error?: string }).error || "Failed to add URL to knowledge base.");
      } else {
        const chunks = typeof (data as { chunksAdded?: number }).chunksAdded === "number"
          ? (data as { chunksAdded: number }).chunksAdded
          : undefined;
        toast.success(
          chunks != null
            ? `Website added — ${chunks} chunk${chunks === 1 ? "" : "s"} indexed.`
            : "Website added to knowledge base.",
        );
        setRagUrl("");
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
        toast.error((payload as { error?: string }).error || "Failed to upload documents.");
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

  function openAssignDialog(ticket: TicketRow) {
    setSelectedTicket(ticket);
    setSelectedVetId("");
    setAssignDialogOpen(true);
  }

  function getVetName(vetId: string | null | undefined): string {
    if (!vetId) return "Unassigned";
    const v = vets.find((x) => x.id === vetId);
    return v ? v.name || v.username : "Unknown";
  }

  function openTicketCount(vetId: string): number {
    return tickets.filter(
      (t) => t.assignedDoctorId === vetId && (t.status ?? "open").toLowerCase() !== "closed"
    ).length;
  }

  async function handleCloseTicket(ticket: TicketRow) {
    if (!confirm("Close this ticket? The vet will no longer see it.")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/tickets/${ticket._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to close");
      }
      toast.success("Ticket closed");
      await loadTickets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close ticket");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssign() {
    if (!selectedTicket || !selectedVetId) {
      toast.error("Select a vet to assign");
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/tickets/${selectedTicket._id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: selectedVetId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to assign");
      }
      toast.success("Ticket assigned to vet");
      setAssignDialogOpen(false);
      setSelectedTicket(null);
      setSelectedVetId("");
      await loadTickets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign ticket");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const unassigned = tickets.filter((t) => !t.assignedDoctorId);
  const assigned = tickets.filter((t) => t.assignedDoctorId);
  const openTickets = tickets.filter((t) => (t.status ?? "open").toLowerCase() !== "closed");
  const closedTickets = tickets
    .filter((t) => (t.status ?? "open").toLowerCase() === "closed")
    .sort((a, b) => {
      const dateA = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const dateB = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return dateB - dateA;
    });

  // Chart data: vet load (open tickets per vet)
  const STATUS_COLORS = { Unassigned: "#94a3b8", "Assigned (open)": "#3b82f6", Closed: "#22c55e" };
  const statusPieData = [
    { name: "Unassigned", value: unassigned.filter((t) => (t.status ?? "open").toLowerCase() !== "closed").length, color: STATUS_COLORS.Unassigned },
    { name: "Assigned (open)", value: assigned.filter((t) => (t.status ?? "open").toLowerCase() !== "closed").length, color: STATUS_COLORS["Assigned (open)"] },
    { name: "Closed", value: closedTickets.length, color: STATUS_COLORS.Closed },
  ].filter((d) => d.value > 0);

  const pdfDocs = documents.filter((d) => (d.format ?? "").toLowerCase() !== "url");
  const urlDocs = documents.filter(
    (d) => (d.format ?? "").toLowerCase() === "url" || d.id.startsWith("url:"),
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <div className="max-w-[1600px] mx-auto p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Triage cases, assign to vets by workload, or close when needed.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LoggedInUser compact className="hidden sm:block" />
            <Button variant="outline" size="sm" onClick={handleLogout} className="shrink-0">
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          </div>
        </div>

        {/* Top bar: Unassigned, Assigned, Open, Closed */}
        <div className="flex flex-wrap items-center gap-6 py-3 px-4 rounded-lg border bg-card/50 mb-6 w-fit">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-amber-600" />
            <span className="text-sm text-muted-foreground">Unassigned</span>
            <span className="text-sm font-bold tabular-nums">{unassigned.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-blue-600" />
            <span className="text-sm text-muted-foreground">Assigned</span>
            <span className="text-sm font-bold tabular-nums">{assigned.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-sky-600" />
            <span className="text-sm text-muted-foreground">Open</span>
            <span className="text-sm font-bold tabular-nums">{openTickets.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-emerald-600" />
            <span className="text-sm text-muted-foreground">Closed</span>
            <span className="text-sm font-bold tabular-nums">{closedTickets.length}</span>
          </div>
        </div>

        {/* Two columns: left = controls/charts, right = tables */}
        <div className="grid grid-cols-1 lg:grid-cols-[560px_1fr] gap-6 items-start">
          {/* Left column: 2-column grid */}
          <div className="order-2 lg:order-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Knowledge base (admin) */}
            <Card className="bg-card/80 shadow-sm overflow-hidden sm:col-span-2">
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Globe className="size-3.5 text-muted-foreground" />
                  Knowledge base
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/70 bg-muted/10 p-3 flex flex-col min-h-[108px]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">Add PDFs</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Upload reference documents for RAG.
                        </p>
                      </div>
                      <Button
                        onClick={handleUploadClick}
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0"
                        disabled={uploadingDocuments}
                      >
                        <Upload className="size-3.5 mr-1.5" />
                        {uploadingDocuments ? "Adding…" : "Upload"}
                      </Button>
                    </div>
                    <div className="mt-auto" />
                    <input
                      ref={ragUploadInputRef}
                      type="file"
                      onChange={handleFileChange}
                      multiple
                      accept="application/pdf"
                      className="hidden"
                    />
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/10 p-3 flex flex-col min-h-[108px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">Add website URL</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Index a webpage into the knowledge base.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0"
                        onClick={handleAddUrlToRag}
                        disabled={addingUrl || !ragUrl.trim()}
                      >
                        {addingUrl ? "Adding…" : "Add"}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="url"
                        placeholder="https://example.com/article"
                        value={ragUrl}
                        onChange={(e) => setRagUrl(e.target.value)}
                        className="h-9 text-xs"
                        disabled={addingUrl}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!addingUrl && ragUrl.trim()) {
                              void handleAddUrlToRag();
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Sources
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={fetchDocuments}
                      disabled={documentsLoading}
                    >
                      {documentsLoading ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>

                  {documentsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : documents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No PDFs/URLs added yet.</p>
                  ) : (
                    <Tabs defaultValue="pdfs" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-9">
                        <TabsTrigger value="pdfs" className="text-xs gap-1.5">
                          PDFs
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {pdfDocs.length}
                          </span>
                        </TabsTrigger>
                        <TabsTrigger value="urls" className="text-xs gap-1.5">
                          URLs
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500/20 px-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                            {urlDocs.length}
                          </span>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="pdfs" className="mt-3 space-y-2">
                        {pdfDocs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No PDFs uploaded yet.</p>
                        ) : (
                          <>
                            {pdfDocs.slice(0, 5).map((d) => (
                              <div key={d.id} className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground break-words">{d.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    PDF · {(d.bytes / 1024 / 1024).toFixed(2)} MB
                                  </p>
                                </div>
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Open
                                </a>
                              </div>
                            ))}
                            {pdfDocs.length > 5 && (
                              <p className="text-[11px] text-muted-foreground">
                                Showing 5 of {pdfDocs.length}
                              </p>
                            )}
                          </>
                        )}
                      </TabsContent>

                      <TabsContent value="urls" className="mt-3 space-y-2">
                        {urlDocs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No URLs added yet.</p>
                        ) : (
                          <>
                            {urlDocs.slice(0, 5).map((d) => (
                              <div key={d.id} className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground break-words">{d.name}</p>
                                  <p className="text-[11px] text-muted-foreground">URL</p>
                                </div>
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Open
                                </a>
                              </div>
                            ))}
                            {urlDocs.length > 5 && (
                              <p className="text-[11px] text-muted-foreground">
                                Showing 5 of {urlDocs.length}
                              </p>
                            )}
                          </>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Vets */}
            {!loading && (
              <Card className="bg-card/80 shadow-sm">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Users className="size-3.5 text-muted-foreground" />
                    Vets
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tabular-nums">{vets.length}</span>
                    <span className="text-xs text-muted-foreground">vets</span>
                  </div>
                  {vets.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {vets.slice(0, 4).map((v) => (
                        <li key={v.id} className="flex justify-between">
                          <span className="truncate">{v.name || v.username}</span>
                          <span className="tabular-nums text-muted-foreground ml-1">{openTicketCount(v.id)} open</span>
                        </li>
                      ))}
                      {vets.length > 4 && <li className="text-muted-foreground">+{vets.length - 4} more</li>}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ticket status pie */}
            {!loading && (
              <Card className="bg-card/80 shadow-sm overflow-visible">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <PieChartIcon className="size-3.5 text-muted-foreground" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 overflow-visible">
                  {statusPieData.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No tickets</p>
                  ) : (
                    <div className="w-full overflow-visible" style={{ height: 170 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <Pie
                            data={statusPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            innerRadius={24}
                            outerRadius={40}
                            paddingAngle={2}
                            isAnimationActive={false}
                          >
                            {statusPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} stroke="transparent" />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [value, "Tickets"]} />
                          <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ paddingTop: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>

          {/* Right column: two tables */}
          <div className="space-y-6 order-1 lg:order-2">
            {/* Live tickets table */}
            <Card className="bg-card shadow-sm flex flex-col min-h-0">
              <CardHeader className="shrink-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="size-4" />
                  Live tickets
                </CardTitle>
                <CardDescription>
                  Open tickets. Assign to a vet or close. Only assigned tickets appear on the vet dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-auto">
                {loading ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
                ) : openTickets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">No live tickets.</div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">User</th>
                          <th className="text-left p-3 font-medium">Animal</th>
                          <th className="text-left p-3 font-medium">Severity</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-left p-3 font-medium">Assigned to</th>
                          <th className="text-left p-3 font-medium">Created</th>
                          <th className="text-right p-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openTickets.map((t) => (
                          <tr key={t._id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3">
                              <span className="font-medium">{t.patientName || "—"}</span>
                            </td>
                            <td className="p-3">{t.animalType || "—"}</td>
                            <td className="p-3 capitalize">{t.severity ?? "medium"}</td>
                            <td className="p-3 capitalize">{t.status ?? "open"}</td>
                            <td className="p-3">{getVetName(t.assignedDoctorId)}</td>
                            <td className="p-3 text-muted-foreground">
                              {t.createdAt
                                ? new Date(t.createdAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setViewingTicket(t)}
                                  className="gap-1 text-primary hover:bg-primary/10"
                                >
                                  <Eye className="size-4" />
                                  View
                                </Button>
                                {!t.assignedDoctorId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAssignDialog(t)}
                                    disabled={actionLoading}
                                  >
                                    <UserPlus className="size-4 mr-1" />
                                    Assign
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCloseTicket(t)}
                                  disabled={actionLoading}
                                  title="Close ticket"
                                >
                                  <XCircle className="size-4 mr-1" />
                                  Close
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Closed tickets table */}
            <Card className="bg-card shadow-sm flex flex-col min-h-0">
              <CardHeader className="shrink-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <XCircle className="size-4" />
                  Closed tickets
                </CardTitle>
                <CardDescription>
                  Closed tickets. View details only.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-auto">
                {loading ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
                ) : closedTickets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">No closed tickets.</div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">User</th>
                          <th className="text-left p-3 font-medium">Animal</th>
                          <th className="text-left p-3 font-medium">Severity</th>
                          <th className="text-left p-3 font-medium">Assigned to</th>
                          <th className="text-left p-3 font-medium">Closed</th>
                          <th className="text-right p-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedTickets.map((t) => (
                          <tr key={t._id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3">
                              <span className="font-medium">{t.patientName || "—"}</span>
                            </td>
                            <td className="p-3">{t.animalType || "—"}</td>
                            <td className="p-3 capitalize">{t.severity ?? "medium"}</td>
                            <td className="p-3">{getVetName(t.assignedDoctorId)}</td>
                            <td className="p-3 text-muted-foreground">
                              {t.closedAt
                                ? new Date(t.closedAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewingTicket(t)}
                                className="gap-1 text-primary hover:bg-primary/10"
                              >
                                <Eye className="size-4" />
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Assign dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign ticket to vet</DialogTitle>
              <DialogDescription>
                Choose a vet. Their current open ticket count is shown so you can balance load.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {vets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vets found. Add vet/doctor users first.</p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="assign-vet">Vet</Label>
                  <select
                    id="assign-vet"
                    value={selectedVetId}
                    onChange={(e) => setSelectedVetId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select a vet</option>
                    {vets.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || v.username} ({openTicketCount(v.id)} open)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={!selectedVetId || actionLoading}>
                {actionLoading ? "Assigning…" : "Assign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ticket detail dialog (view like vet) */}
        <Dialog open={!!viewingTicket} onOpenChange={(open) => !open && setViewingTicket(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogTitle className="sr-only">Ticket details</DialogTitle>
            {viewingTicket && (() => {
              const t = viewingTicket;
              const severityColors: Record<string, string> = {
                critical: "#dc2626",
                high: "#ea580c",
                medium: "#ca8a04",
                low: "#16a34a",
              };
              const sev = (t.severity ?? "medium").toLowerCase();
              const isOpen = (t.status ?? "open").toLowerCase() !== "closed";
              return (
                <>
                  <div className="shrink-0 flex items-center justify-between border-b px-6 py-4 bg-muted/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
                        style={{
                          backgroundColor: `${severityColors[sev] ?? "#94a3b8"}22`,
                          color: severityColors[sev] ?? "#64748b",
                        }}
                      >
                        {t.severity ?? "medium"}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{t.status ?? "open"}</span>
                      {t.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          · {new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 -mr-2" onClick={() => setViewingTicket(null)} aria-label="Close">
                      <XCircle className="size-5" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold">{t.patientName || "Unnamed"}</h2>
                      {t.assignedDoctorId && (
                        <p className="text-sm text-muted-foreground mt-0.5">Assigned to {getVetName(t.assignedDoctorId)}</p>
                      )}
                    </div>

                    <section className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="size-4" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider">Owner information</h3>
                      </div>
                      <div className="rounded-xl border bg-muted/15 p-4 space-y-2 text-sm">
                        <p className="font-medium">{t.patientName || "—"} {[t.patientAge, t.patientGender].filter(Boolean).length ? `· ${[t.patientAge, t.patientGender].filter(Boolean).join(" · ")}` : ""}</p>
                        {t.email && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="size-3.5 shrink-0" />
                            <a href={`mailto:${t.email}`} className="hover:text-foreground underline-offset-2 hover:underline">{t.email}</a>
                          </div>
                        )}
                        {t.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="size-3.5 shrink-0" />
                            <a href={`tel:${t.phone}`} className="hover:text-foreground">{t.phone}</a>
                          </div>
                        )}
                        {(t.address || t.city) && (
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0 mt-0.5" />
                            <span>{[t.address, t.city, t.state, t.zip, t.country].filter(Boolean).join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ClipboardList className="size-4" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider">Clinical</h3>
                      </div>
                      <div className="rounded-xl border bg-muted/15 p-4 space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Animal type</p>
                          <p className="capitalize">{t.animalType?.trim() || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Symptoms</p>
                          <p>{Array.isArray(t.symptoms) && t.symptoms.length > 0 ? t.symptoms.join(", ") : "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Diagnosis / notes</p>
                          {(() => {
                            const diagnosisEntries = parseAiDiagnosis(t.diagnosis);
                            if (diagnosisEntries.length > 0) {
                              return (
                                <div className="rounded-lg border border-border/60 bg-background/50 overflow-hidden">
                                  {diagnosisEntries.map(({ key, value }, idx) => (
                                    <div key={key}>
                                      {idx > 0 && <div className="border-t border-border/60" />}
                                      <div className="px-3 py-2.5">
                                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                                          {getDiagnosisFieldLabel(key)}
                                        </p>
                                        {Array.isArray(value) ? (
                                          value.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                              {value.map((item, i) => (
                                                <span
                                                  key={i}
                                                  className="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-xs text-foreground border border-border/50"
                                                >
                                                  {item}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <span className="text-sm text-muted-foreground">—</span>
                                          )
                                        ) : (
                                          <p className="text-sm text-foreground/90">{value || "—"}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return (
                              <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
                                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{t.diagnosis?.trim() || "—"}</p>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </section>

                    {Array.isArray(t.attachments) && t.attachments.length > 0 && (
                      <section className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileText className="size-4" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider">Images</h3>
                        </div>
                        <div className="rounded-xl border bg-muted/15 p-4">
                          <div className="flex flex-wrap gap-2">
                            {t.attachments.map((b, idx) => (
                              <MultimodalPreview key={idx} block={b} size="md" />
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    {Array.isArray(t.messages) && t.messages.length > 0 && (
                      <section className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MessageSquare className="size-4" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider">Conversation</h3>
                        </div>
                        <ul className="space-y-2">
                          {t.messages.map((m, i) => (
                            <li
                              key={i}
                              className={`rounded-lg px-3 py-2.5 text-sm ${m.from === "vet" || m.from === "doctor" ? "ml-4 bg-primary/10 border border-primary/20" : "mr-4 bg-muted/50 border border-border"}`}
                            >
                              <span className="font-medium capitalize text-muted-foreground text-xs">{m.from}</span>
                              <p className="mt-0.5">{m.text}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {Array.isArray(t.docRequests) && t.docRequests.length > 0 && (
                      <section className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileText className="size-4" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider">Document requests</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {t.docRequests.map((d, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium border ${d.fulfilledAt ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400" : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"}`}
                            >
                              {d.type} · {d.fulfilledAt ? "Fulfilled" : "Pending"}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {isOpen && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {!t.assignedDoctorId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setViewingTicket(null);
                              openAssignDialog(t);
                            }}
                            disabled={actionLoading}
                          >
                            <UserPlus className="size-4 mr-1" />
                            Assign to vet
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await handleCloseTicket(t);
                            setViewingTicket(null);
                          }}
                          disabled={actionLoading}
                        >
                          <XCircle className="size-4 mr-1" />
                          Close ticket
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
