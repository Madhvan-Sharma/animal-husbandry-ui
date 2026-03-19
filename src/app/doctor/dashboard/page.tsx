"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Eye, MessageSquare, FileText, CalendarCheck, Stethoscope, User, ClipboardList, Mail, Phone, MapPin, Pill, XCircle, Plus, Trash2, SendHorizontal, Star, Ambulance, Cross, Beef } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { parseAiDiagnosis, getDiagnosisFieldLabel, getDoctorPrefillFromDiagnosis, getDoctorSuggestionPrefill, isHiddenInDoctorSidebar } from "@/lib/parse-ai-diagnosis";
import { toast } from "sonner";
import { getApiKey } from "@/lib/api-key";
import { extractLangflowMessageText } from "@/lib/langflow-utils";
import { LoggedInUser } from "@/components/auth/logged-in-user";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import type { ContentBlock } from "@/lib/multimodal-utils";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
function severityRank(s: string | undefined): number {
  return SEVERITY_ORDER[(s ?? "medium").toLowerCase()] ?? 2;
}

type Ticket = {
  _id: string;
  userId: string;
  ticketCategory?: string;
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
  userActionedAt?: string | null;
  messages?: { from: string; text: string; createdAt: string }[];
  docRequests?: { type: string; requestedAt: string; fulfilledAt?: string | null }[];
  attachments?: ContentBlock[];
  nextSteps?: string;
  closedAt?: string | null;
  appointment?: { scheduledAt: string; type: string };
  createdAt: string;
};

export default function VetDashboardPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [nextStepsText, setNextStepsText] = useState("");
  const [appointmentDateTime, setAppointmentDateTime] = useState("");
  /** Table rows: medicine name + time duration per row. */
  const [medicineRows, setMedicineRows] = useState<{ medicine: string; duration: string }[]>([]);
  /** Table rows: document names to request (one column). */
  const [docRequestRows, setDocRequestRows] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  /** When closing a ticket: schedule follow-up email after this (e.g. "2 mins", "7 days"). Empty = don't send. */
  const [followUpEmailScheduledAt, setFollowUpEmailScheduledAt] = useState("2 mins");
  const [doctorSuggestionLoading, setDoctorSuggestionLoading] = useState(false);
  /** Per-field AI loading: reply, request_document, recommend_medicine */
  const [replyAiLoading, setReplyAiLoading] = useState(false);
  const [requestDocAiLoading, setRequestDocAiLoading] = useState(false);
  const [medicineAiLoading, setMedicineAiLoading] = useState(false);
  /** Warning from doctor suggestion flow (NEXT_PUBLIC_DOCTOR_SUGGESTION_FLOW_ID); sent in follow-up email when closing. */
  const [doctorSuggestionWarning, setDoctorSuggestionWarning] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "general" | "artificial_insemination">("all");

  const DOCTOR_SUGGESTION_FLOW_ID =
    process.env.NEXT_PUBLIC_DOCTOR_SUGGESTION_FLOW_ID ?? "815bdacd-f85e-407f-89ee-3f53516cca2e";

  useEffect(() => {
    if (selected) {
      setReplyText("");
      setMedicineRows([{ medicine: "", duration: "" }]);
      setDocRequestRows([""]);
      setDoctorSuggestionWarning("");
    } else {
      setReplyText("");
      setMedicineRows([]);
      setDocRequestRows([]);
      setDoctorSuggestionWarning("");
    }
  }, [selected]);

  async function handleFillWithAI() {
    if (!selected) return;
    setDoctorSuggestionLoading(true);
    const fallbackPrefill = getDoctorPrefillFromDiagnosis(selected.diagnosis);
    try {
      const inputValue = [
        "[Diagnosis]",
        selected.diagnosis?.trim() ?? "",
        "[Symptoms]",
        Array.isArray(selected.symptoms) ? selected.symptoms.join(", ") : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const apiKey = getApiKey() ?? "";
      const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
      const endpoint = apiBase
        ? `${apiBase}/run/${DOCTOR_SUGGESTION_FLOW_ID}`
        : `/api/run/${DOCTOR_SUGGESTION_FLOW_ID}`;
      const sessionId = crypto.randomUUID();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { "x-api-key": apiKey }),
        },
        body: JSON.stringify({
          output_type: "chat",
          input_type: "chat",
          input_value: inputValue,
          session_id: sessionId,
          stream: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyText(fallbackPrefill.suggestion);
        setMedicineRows([{ medicine: "", duration: "" }]);
        setDocRequestRows([""]);
        toast.error("Could not load AI suggestions");
        return;
      }
      const text = extractLangflowMessageText(data);
      const prefill = getDoctorSuggestionPrefill(text);
      setReplyText(prefill.doctorSuggestion || fallbackPrefill.suggestion);
      setMedicineRows(
        prefill.medicineRecommended.length > 0
          ? prefill.medicineRecommended.map((m) => ({ medicine: m, duration: "" }))
          : [{ medicine: "", duration: "" }]
      );
      setDocRequestRows(
        prefill.requestedDocuments.length > 0 ? prefill.requestedDocuments : [""]
      );
      setDoctorSuggestionWarning(prefill.warningMessage ?? "");
      toast.success("AI suggestions applied");
    } catch {
      setReplyText(fallbackPrefill.suggestion);
      setMedicineRows([{ medicine: "", duration: "" }]);
      setDocRequestRows([""]);
      toast.error("Could not load AI suggestions");
    } finally {
      setDoctorSuggestionLoading(false);
    }
  }

  async function callVetSuggestionApi(type: "reply" | "request_document" | "recommend_medicine") {
    if (!selected) return;
    const res = await fetch("/api/tickets/vet-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        diagnosis: selected.diagnosis?.trim() ?? "",
        symptoms: Array.isArray(selected.symptoms) ? selected.symptoms : [],
        animalType: selected.animalType ?? "",
        messages: (selected.messages ?? []).map((m) => ({ from: m.from, text: m.text })),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Request failed");
    }
    return res.json();
  }

  async function handleFillReplyWithAI() {
    if (!selected) return;
    setReplyAiLoading(true);
    try {
      const data = await callVetSuggestionApi("reply");
      const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
      if (reply) setReplyText(reply);
      toast.success("Reply suggestion applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load reply suggestion");
    } finally {
      setReplyAiLoading(false);
    }
  }

  async function handleFillRequestDocWithAI() {
    if (!selected) return;
    setRequestDocAiLoading(true);
    try {
      const data = await callVetSuggestionApi("request_document");
      const documents = Array.isArray(data?.documents) ? data.documents.filter((d: unknown) => typeof d === "string" && String(d).trim()) : [];
      if (documents.length > 0) {
        setDocRequestRows(documents.map((d: string) => String(d).trim()));
      } else {
        setDocRequestRows([""]);
      }
      toast.success("Document suggestions applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load document suggestions");
    } finally {
      setRequestDocAiLoading(false);
    }
  }

  async function handleFillMedicineWithAI() {
    if (!selected) return;
    setMedicineAiLoading(true);
    try {
      const data = await callVetSuggestionApi("recommend_medicine");
      const medicines = Array.isArray(data?.medicines) ? data.medicines : [];
      if (medicines.length > 0) {
        setMedicineRows(
          medicines.map((m: { name?: string; duration?: string }) => ({
            medicine: typeof m.name === "string" ? m.name : "",
            duration: typeof m.duration === "string" ? m.duration : "",
          }))
        );
      } else {
        setMedicineRows([{ medicine: "", duration: "" }]);
      }
      toast.success("Medicine suggestions applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load medicine suggestions");
    } finally {
      setMedicineAiLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tickets?forVet=1")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setTickets(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Refresh tickets when another client updates (e.g. user uploads/replies).
  useEffect(() => {
    const onTicketsRefresh = async () => {
      setLoading(true);
      try {
        const data = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(data)) {
          setTickets(data);
          if (selected) {
            const updated = data.find((t: Ticket) => t._id === selected._id);
            if (updated) setSelected(updated);
          }
        }
      } catch {
        // Keep existing UI on transient errors
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener("tickets:refresh", onTicketsRefresh);
    return () => {
      window.removeEventListener("tickets:refresh", onTicketsRefresh);
    };
  }, [selected]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const openTickets = tickets.filter((t) => (t.status ?? "open").toLowerCase() !== "closed");
  const bySeverityOpen = openTickets.reduce<Record<string, number>>((acc, t) => {
    const s = (t.severity ?? "medium").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(bySeverityOpen).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: SEVERITY_COLORS[name] ?? "#94a3b8",
  }));
  const bySeverityAll = tickets.reduce<Record<string, number>>((acc, t) => {
    const s = (t.severity ?? "medium").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const byStatus = tickets.reduce<Record<string, number>>((acc, t) => {
    const s = (t.status ?? "open").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const statusChartData = [
    { key: "open", name: "Open", count: byStatus.open ?? 0 },
    { key: "awaiting_docs", name: "Awaiting docs", count: byStatus.awaiting_docs ?? 0 },
    {
      key: "in_progress",
      name: "In progress",
      count:
        (byStatus.awaiting_patient ?? 0) +
        (byStatus.in_progress ?? 0) +
        (byStatus.appointment_scheduled ?? 0),
    },
    { key: "closed", name: "Closed", count: byStatus.closed ?? 0 },
  ];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const ticketsByDay = last7Days.map((day) => {
    const count = tickets.filter((t) => t.createdAt && t.createdAt.startsWith(day)).length;
    return {
      date: new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      short: new Date(day).toLocaleDateString(undefined, { weekday: "short" }),
      tickets: count,
    };
  });

  async function handleAddMessage() {
    if (!selected || !replyText.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMessage: replyText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReplyText("");
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Message sent to patient");
      } else {
        toast.error(data.error ?? "Failed to send message");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispatch(kind: "ambulance" | "vet_team" | "ai_team") {
    if (!selected) return;
    const labels: Record<typeof kind, string> = {
      ambulance: "Ambulance dispatched",
      vet_team: "Vet team dispatched",
      ai_team: "Artificial insemination team dispatched",
    };
    const bodyText: Record<typeof kind, string> = {
      ambulance:
        "Dispatch update: Ambulance has been dispatched to your location. Please keep the animal stable and share your exact location/landmark if needed.",
      vet_team:
        "Dispatch update: A vet team has been dispatched. Please be available on call and share any additional symptoms or recent changes.",
      ai_team:
        "Dispatch update: An Artificial Insemination (AI) team has been dispatched. Please confirm preferred timing and availability on-site.",
    };
    if (!confirm(`${labels[kind]}? This will notify the user.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addMessage: bodyText[kind] }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success(labels[kind]);
      } else {
        toast.error(data.error ?? "Failed to dispatch");
      }
    } catch {
      toast.error("Failed to dispatch");
    } finally {
      setActionLoading(false);
    }
  }

  function buildMedicineMessage(): string {
    return medicineRows
      .filter((r) => r.medicine.trim())
      .map((r) =>
        r.duration.trim() ? `${r.medicine.trim()} (${r.duration.trim()})` : r.medicine.trim()
      )
      .join(", ");
  }

  async function handleRecommendMedicineAndClose() {
    const message = buildMedicineMessage();
    if (!selected || !message) return;
    setActionLoading(true);
    try {
      const body: { recommendMedicine: string; followUpEmailScheduledAt?: string; followUpWarningMessage?: string } = {
        recommendMedicine: message,
      };
      const hasMedicineFilled = medicineRows.some((r) => r.medicine.trim());
      if (hasMedicineFilled && followUpEmailScheduledAt.trim()) {
        body.followUpEmailScheduledAt = followUpEmailScheduledAt.trim();
        if (doctorSuggestionWarning.trim()) body.followUpWarningMessage = doctorSuggestionWarning.trim();
      }
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMedicineRows([{ medicine: "", duration: "" }]);
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Medicine recommended and consultation closed");
      } else {
        toast.error(data.error ?? "Failed to recommend and close");
      }
    } catch {
      toast.error("Failed to recommend and close");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestDocs() {
    const docs = docRequestRows.map((d) => d.trim()).filter(Boolean);
    if (!selected || docs.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestDocs: docs }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDocRequestRows([""]);
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Document request sent");
      } else {
        toast.error(data.error ?? "Failed to request document");
      }
    } catch {
      toast.error("Failed to request document");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseTicket() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const body: { close: true; followUpEmailScheduledAt?: string; followUpWarningMessage?: string } = { close: true };
      if (followUpEmailScheduledAt.trim()) body.followUpEmailScheduledAt = followUpEmailScheduledAt.trim();
      if (doctorSuggestionWarning.trim()) body.followUpWarningMessage = doctorSuggestionWarning.trim();
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelected(null);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Consultation closed");
      } else {
        toast.error(data.error ?? "Failed to close consultation");
      }
    } catch {
      toast.error("Failed to close consultation");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleScheduleAppointment() {
    if (!selected) return;
    setActionLoading(true);
    try {
      const body: { suggestMeetAndClose: true; nextSteps: string; appointmentTime?: string } = {
        suggestMeetAndClose: true,
        nextSteps: nextStepsText.trim() || "Physical meet suggested",
      };
      if (appointmentDateTime) {
        body.appointmentTime = new Date(appointmentDateTime).toISOString();
      }
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNextStepsText("");
        setAppointmentDateTime("");
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Appointment scheduled");
      } else {
        toast.error(data.error ?? "Failed to schedule appointment");
      }
    } catch {
      toast.error("Failed to schedule appointment");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRescheduleAppointment() {
    if (!selected) return;
    const scheduledAt = appointmentDateTime
      ? new Date(appointmentDateTime).toISOString()
      : selected.appointment?.scheduledAt
        ? (typeof selected.appointment.scheduledAt === "string"
          ? selected.appointment.scheduledAt
          : new Date(selected.appointment.scheduledAt).toISOString())
        : null;
    if (!scheduledAt) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rescheduleAppointment: true,
          appointmentTime: scheduledAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAppointmentDateTime("");
        setSelected(data);
        const list = await fetch("/api/tickets?forVet=1").then((r) => r.json());
        if (Array.isArray(list)) setTickets(list);
        toast.success("Appointment rescheduled");
      } else {
        toast.error(data.error ?? "Failed to reschedule appointment");
      }
    } catch {
      toast.error("Failed to reschedule appointment");
    } finally {
      setActionLoading(false);
    }
  }

  const total = tickets.length;
  const critical = bySeverityAll.critical ?? 0;
  const high = bySeverityAll.high ?? 0;
  const medium = bySeverityAll.medium ?? 0;
  const low = bySeverityAll.low ?? 0;

  const openTicketsSorted = [...openTickets].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    const dateDiff = dateB - dateA;
    if (dateDiff !== 0) return dateDiff;
    return severityRank(b.severity) - severityRank(a.severity);
  });
  const matchesCategory = (t: Ticket) =>
    categoryFilter === "all" || (t.ticketCategory ?? "general") === categoryFilter;
  const filteredOpenTicketsSorted = openTicketsSorted.filter(matchesCategory);
  const allCount = tickets.length;
  const generalCount = tickets.filter((t) => (t.ticketCategory ?? "general") === "general").length;
  const aiCount = tickets.filter((t) => (t.ticketCategory ?? "general") === "artificial_insemination").length;
  const closedTickets = tickets
    .filter((t) => (t.status ?? "open").toLowerCase() === "closed")
    .sort((a, b) => {
      const dateA = (a.closedAt || a.createdAt) ? new Date((a.closedAt || a.createdAt) as string).getTime() : 0;
      const dateB = (b.closedAt || b.createdAt) ? new Date((b.closedAt || b.createdAt) as string).getTime() : 0;
      const dateDiff = dateB - dateA;
      if (dateDiff !== 0) return dateDiff;
      return severityRank(b.severity) - severityRank(a.severity);
    });
  const filteredClosedTickets = closedTickets.filter(matchesCategory);

  return (
    <div className="min-h-screen bg-background w-full">
      <Toaster />
      <header className="sticky top-0 z-10 border-b border-border/80 bg-card/80 backdrop-blur-sm w-full">
        <div className="w-full flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Vet Dashboard</h1>
              <p className="text-xs text-muted-foreground">Tickets · Livestock owners</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LoggedInUser compact className="hidden sm:block" />
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="py-4">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-foreground">{total}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">Total</p>
            </CardContent>
          </Card>
          <Card className="py-4 border-l-4 border-l-red-500/80">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">{critical}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">Critical</p>
            </CardContent>
          </Card>
          <Card className="py-4 border-l-4 border-l-orange-500/80">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-orange-600 dark:text-orange-400">{high}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">High</p>
            </CardContent>
          </Card>
          <Card className="py-4 border-l-4 border-l-amber-500/80">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{medium}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">Medium</p>
            </CardContent>
          </Card>
          <Card className="py-4 border-l-4 border-l-green-500/80">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400">{low}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">Low</p>
            </CardContent>
          </Card>
          <Card className="py-4 bg-muted/30">
            <CardContent className="p-0 px-4">
              <p className="text-2xl font-semibold tabular-nums text-foreground">{tickets.filter((t) => (t.status ?? "open") === "open").length}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-0.5">Open</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left: pie full width, then two bar charts side by side */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">By severity (open consultations)</CardTitle>
                <p className="text-xs text-muted-foreground">Distribution of non-closed consultations</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[200px] w-full">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [value, "tickets"]}
                          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                        <Legend layout="horizontal" align="center" verticalAlign="bottom" />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground text-sm">
                      No open tickets
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">By status</CardTitle>
                  <p className="text-xs text-muted-foreground">Open vs closed</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[160px] w-full">
                    {tickets.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={22} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                            formatter={(value: number) => [value, "tickets"]}
                          />
                          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Tickets" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground text-sm">
                        No data yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Last 7 days</CardTitle>
                  <p className="text-xs text-muted-foreground">New tickets</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[160px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ticketsByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                        <XAxis dataKey="short" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={22} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                          formatter={(value: number) => [value, "tickets"]}
                          labelFormatter={(_, payload) => payload[0]?.payload?.date}
                        />
                        <Bar dataKey="tickets" fill="var(--primary)" radius={[4, 4, 0, 0]} name="New tickets" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right: Open tickets table (full right side) */}
          <Card className="lg:col-span-8 overflow-hidden flex flex-col min-h-0">
            <CardHeader className="pb-4 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base font-medium">Open tickets</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="vet-category-filter" className="text-xs text-muted-foreground">
                    Category
                  </Label>
                  <select
                    id="vet-category-filter"
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as "all" | "general" | "artificial_insemination")
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="general">General</option>
                    <option value="artificial_insemination">Artificial Insemination</option>
                  </select>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      All ({allCount})
                    </span>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      General ({generalCount})
                    </span>
                    <span className="inline-flex items-center rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-400">
                      AI ({aiCount})
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Click View to respond</p>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                  <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
                  Loading tickets…
                </div>
              ) : filteredOpenTicketsSorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm rounded-b-xl bg-muted/10">
                  No open tickets.
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-muted/40">
                      <tr className="border-b border-border">
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Owner</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Animal</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32">Category</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Severity</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Status</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Symptoms</th>
                        <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Created</th>
                        <th className="py-3.5 px-4 w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOpenTicketsSorted.map((t) => (
                        <tr
                          key={t._id}
                          className={cn(
                            "border-b border-border/50 transition-colors",
                            "hover:bg-muted/30",
                            selected?._id === t._id && "bg-primary/10"
                          )}
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-foreground">{t.patientName || "—"}</span>
                            {(t.patientAge || t.patientGender) && (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                {[t.patientAge, t.patientGender].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-sm text-muted-foreground capitalize">
                              {t.animalType && String(t.animalType).trim()
                                ? String(t.animalType).trim()
                                : "—"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-muted-foreground">
                            {(t.ticketCategory ?? "general") === "artificial_insemination"
                              ? "Artificial Insemination"
                              : "General"}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className="inline-flex rounded-md px-2 py-1 text-xs font-medium capitalize"
                              style={{
                                backgroundColor: `${SEVERITY_COLORS[(t.severity ?? "medium").toLowerCase()] ?? "#94a3b8"}18`,
                                color: SEVERITY_COLORS[(t.severity ?? "medium").toLowerCase()] ?? "#64748b",
                              }}
                            >
                              {t.severity ?? "medium"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 capitalize text-muted-foreground">
                            <div className="flex flex-col items-start gap-1">
                              <span>{t.status ?? "open"}</span>
                              {!!t.userActionedAt && (
                                <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-wide text-emerald-700 dark:text-emerald-400">
                                  User actioned
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 max-w-[200px] truncate text-muted-foreground">
                            {Array.isArray(t.symptoms) && t.symptoms.length > 0
                              ? t.symptoms.join(", ")
                              : "—"}
                          </td>
                          <td className="py-3.5 px-4 text-muted-foreground text-xs whitespace-nowrap">
                            {t.createdAt
                              ? new Date(t.createdAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="py-3.5 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelected(t)}
                              className="gap-1.5 text-primary hover:bg-primary/10"
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

        {/* Closed tickets - separate block */}
        {!loading && filteredClosedTickets.length > 0 && (
          <Card className="overflow-hidden flex flex-col min-h-0">
            <CardHeader className="pb-4 shrink-0">
              <CardTitle className="text-base font-medium">Closed tickets</CardTitle>
              <p className="text-xs text-muted-foreground">Sorted by closed date</p>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[320px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-muted/40">
                    <tr className="border-b border-border">
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Owner</th>
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Animal</th>
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-32">Category</th>
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24">Severity</th>
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Symptoms</th>
                      <th className="text-left py-3.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Closed</th>
                      <th className="py-3.5 px-4 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClosedTickets.map((t) => (
                      <tr
                        key={t._id}
                        className={cn(
                          "border-b border-border/50 transition-colors",
                          "hover:bg-muted/30",
                          selected?._id === t._id && "bg-primary/10"
                        )}
                      >
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-foreground">{t.patientName || "—"}</span>
                          {(t.patientAge || t.patientGender) && (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {[t.patientAge, t.patientGender].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-sm text-muted-foreground capitalize">
                            {t.animalType && String(t.animalType).trim()
                              ? String(t.animalType).trim()
                              : "—"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-muted-foreground">
                          {(t.ticketCategory ?? "general") === "artificial_insemination"
                            ? "Artificial Insemination"
                            : "General"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className="inline-flex rounded-md px-2 py-1 text-xs font-medium capitalize"
                            style={{
                              backgroundColor: `${SEVERITY_COLORS[(t.severity ?? "medium").toLowerCase()] ?? "#94a3b8"}18`,
                              color: SEVERITY_COLORS[(t.severity ?? "medium").toLowerCase()] ?? "#64748b",
                            }}
                          >
                            {t.severity ?? "medium"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[200px] truncate text-muted-foreground">
                          {Array.isArray(t.symptoms) && t.symptoms.length > 0 ? t.symptoms.join(", ") : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground text-xs whitespace-nowrap">
                          {t.closedAt
                            ? new Date(t.closedAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : t.createdAt
                              ? new Date(t.createdAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(t)}
                            className="gap-1.5 text-primary hover:bg-primary/10"
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
            </CardContent>
          </Card>
        )}
      </main>

      {/* Consultation detail popup */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent
          className="max-w-6xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-border shadow-2xl"
          onPointerDownOutside={() => setSelected(null)}
        >
          {selected && (
            <>
              {/* Popup header */}
              <div className="shrink-0 flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
                <DialogHeader className="p-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[(selected.severity ?? "medium").toLowerCase()] ?? "#94a3b8"}22`,
                        color: SEVERITY_COLORS[(selected.severity ?? "medium").toLowerCase()] ?? "#64748b",
                      }}
                    >
                      {selected.severity ?? "medium"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize font-medium">
                      {selected.status ?? "open"}
                    </span>
                    {selected.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        · {new Date(selected.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <DialogTitle className="text-xl font-semibold tracking-tight text-left">
                    {selected.patientName || "Unnamed patient"}
                  </DialogTitle>
                </DialogHeader>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-full -mr-2"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                >
                  <XCircle className="size-5" />
                </Button>
              </div>

              {/* Two columns: left = info + diagnosis, right = actions */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)] min-h-0">
        {/* Left column: owner info + AI diagnosis + conversation */}
                <div className="overflow-y-auto border-r border-border bg-background/50 p-6 space-y-6">
                {/* Owner info */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="size-4" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider">Owner information</h3>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3">
                    <p className="font-medium text-foreground">
                      {selected.patientName || "—"}
                      {(selected.patientAge || selected.patientGender) && (
                        <span className="text-muted-foreground font-normal ml-2 text-sm">
                          · {[selected.patientAge, selected.patientGender].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </p>
                    {selected.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="size-3.5 shrink-0" />
                        <a href={`mailto:${selected.email}`} className="hover:text-foreground underline-offset-2 hover:underline">{selected.email}</a>
                      </div>
                    )}
                    {selected.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="size-3.5 shrink-0" />
                        <a href={`tel:${selected.phone}`} className="hover:text-foreground">{selected.phone}</a>
                      </div>
                    )}
                    {(selected.address || selected.city) && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0 mt-0.5" />
                        <span>{[selected.address, selected.city, selected.state].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Clinical */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ClipboardList className="size-4" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider">Clinical</h3>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Animal type</p>
                      <p className="text-sm text-foreground capitalize">
                        {selected.animalType && String(selected.animalType).trim()
                          ? String(selected.animalType).trim()
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Category</p>
                      <p className="text-sm text-foreground">
                        {(selected.ticketCategory ?? "general") === "artificial_insemination"
                          ? "Artificial Insemination"
                          : "General"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Symptoms</p>
                      <p className="text-sm text-foreground">
                        {Array.isArray(selected.symptoms) && selected.symptoms.length > 0
                          ? selected.symptoms.join(", ")
                          : "—"}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI diagnosis</p>
                      {(() => {
                        const diagnosisEntries = parseAiDiagnosis(selected.diagnosis).filter(
                          ({ key }) => !isHiddenInDoctorSidebar(key)
                        );
                        return diagnosisEntries.length > 0 ? (
                        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                          {diagnosisEntries.map(({ key, value }, idx) => (
                            <div key={key}>
                              {idx > 0 && <Separator />}
                              <div className="px-4 py-3">
                                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/90 mb-1.5">
                                  {getDiagnosisFieldLabel(key)}
                                </p>
                                {Array.isArray(value) ? (
                                  value.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {value.map((item, i) => (
                                        <span
                                          key={i}
                                          className="inline-flex items-center rounded-md bg-muted/80 px-2.5 py-1 text-xs text-foreground border border-border/60"
                                        >
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )
                                ) : (
                                  <p
                                    className={cn(
                                      "text-sm",
                                      key.toLowerCase().includes("severity")
                                        ? "font-semibold text-foreground"
                                        : "text-foreground/90"
                                    )}
                                  >
                                    {value || "—"}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-card px-4 py-3">
                          {selected.diagnosis?.trim() || "—"}
                        </p>
                      );
                      })()}
                    </div>
                  </div>
                </section>

                {/* Images */}
                {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                  <section className="space-y-3">
                    {(() => {
                      const imageAttachments = selected.attachments.filter(
                        (b) => b.type === "image" && typeof b.mimeType === "string" && b.mimeType.startsWith("image/"),
                      );
                      const pdfAttachments = selected.attachments.filter(
                        (b) => b.type === "file" && b.mimeType === "application/pdf",
                      );

                      return (
                        <>
                          {imageAttachments.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <FileText className="size-4" />
                                <h3 className="text-xs font-semibold uppercase tracking-wider">Images</h3>
                              </div>
                              <div className="rounded-xl border border-border bg-muted/15 p-4">
                                <div className="flex flex-wrap gap-2">
                                  {imageAttachments.map((b, idx) => (
                                    <MultimodalPreview key={`img-${idx}`} block={b} size="lg" />
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {pdfAttachments.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <FileText className="size-4" />
                                <h3 className="text-xs font-semibold uppercase tracking-wider">PDF documents</h3>
                              </div>
                              <div className="rounded-xl border border-border bg-muted/15 p-4">
                                <div className="flex flex-wrap gap-2">
                                  {pdfAttachments.map((b, idx) => (
                                    <MultimodalPreview key={`pdf-${idx}`} block={b} size="lg" />
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </section>
                )}

                {/* Messages */}
                {Array.isArray(selected.messages) && selected.messages.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MessageSquare className="size-4" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider">Conversation</h3>
                    </div>
                    <ul className="space-y-2.5 rounded-xl border border-border bg-background/50 p-3">
                      {selected.messages.map((m, i) => (
                        <li key={i} className={cn("flex", m.from === "vet" || m.from === "doctor" ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm shadow-sm",
                              m.from === "vet" || m.from === "doctor"
                                ? "bg-primary/12 border border-primary/25 text-foreground"
                                : "bg-muted/60 border border-border text-foreground"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold capitalize text-[11px] text-muted-foreground">{m.from}</span>
                              {m.createdAt && (
                                <span className="text-[10px] text-muted-foreground/80 whitespace-nowrap">
                                  {new Date(m.createdAt).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Doc requests */}
                {Array.isArray(selected.docRequests) && selected.docRequests.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="size-4" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider">Document requests</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.docRequests.map((d, i) => {
                        const uploadedForType =
                          Array.isArray(selected.attachments) && selected.attachments.length > 0
                            ? selected.attachments.filter(
                                (b) =>
                                  b.type === "file" &&
                                  b.mimeType === "application/pdf" &&
                                  (b.metadata as { documentType?: string } | undefined)?.documentType === d.type,
                              )
                            : [];

                        const displayName =
                          uploadedForType.length > 0
                            ? String(uploadedForType[0]?.metadata?.filename ?? uploadedForType[0]?.metadata?.name ?? d.type)
                            : d.type;

                        return (
                          <div key={i} className="flex flex-col">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium border",
                                d.fulfilledAt
                                  ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {displayName} · {d.fulfilledAt ? "Fulfilled" : "Pending"}
                            </span>
                            {uploadedForType.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {uploadedForType.map((b, idx) => (
                                  <MultimodalPreview key={`${d.type}-${idx}`} block={b} size="sm" />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
                </div>

                {/* Right column: Actions */}
                {selected.status !== "closed" && (
                  <div className="overflow-y-auto flex flex-col bg-muted/5 p-6">
                  <section className="space-y-3">
                    <div className="rounded-xl border border-border bg-background shadow-sm p-4 space-y-0">
                      {!selected.assignedDoctorId ? (
                        <p className="text-sm text-muted-foreground">This consultation will be assigned by an admin. Once assigned to you, you can reply, request documents, recommend medicine, or schedule appointments.</p>
                      ) : (
                        <>
                          <div className="space-y-2 pb-4">
                            <Label className="text-xs text-muted-foreground">
                              Dispatch teams
                            </Label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={actionLoading}
                                onClick={() => handleDispatch("ambulance")}
                                className="h-auto min-h-10 justify-start gap-2 rounded-lg bg-red-600 text-white hover:bg-red-700 px-3 py-2 text-xs leading-tight whitespace-normal"
                              >
                                <Ambulance className="size-4 shrink-0" />
                                <span className="min-w-0 break-words">Send ambulance</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={actionLoading}
                                onClick={() => handleDispatch("vet_team")}
                                className="h-auto min-h-10 justify-start gap-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 text-xs leading-tight whitespace-normal"
                              >
                                <Cross className="size-4 shrink-0" />
                                <span className="min-w-0 break-words">Send vet team</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={actionLoading}
                                onClick={() => handleDispatch("ai_team")}
                                className="h-auto min-h-10 justify-start gap-2 rounded-lg bg-fuchsia-600 text-white hover:bg-fuchsia-700 px-3 py-2 text-xs leading-tight whitespace-normal"
                              >
                                <Beef className="size-4 shrink-0" />
                                <span className="min-w-0 break-words">Send Artificial Insemination team</span>
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2 pb-4">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-muted-foreground">Reply to patient</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={replyAiLoading || !selected.diagnosis?.trim()}
                                onClick={handleFillReplyWithAI}
                                className="gap-1.5 text-primary hover:bg-primary/10 h-8 text-xs"
                              >
                                {replyAiLoading ? (
                                  <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                                ) : (
                                  <Star className="size-3.5 shrink-0" />
                                )}
                                {replyAiLoading ? "Loading…" : "Fill with AI"}
                              </Button>
                            </div>
                            <div className="relative">
                              <Textarea
                                className="min-h-[80px] resize-none border-border pr-11 pb-2"
                                placeholder="Message to patient…"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                rows={2}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="absolute bottom-2 right-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                disabled={!replyText.trim() || actionLoading}
                                onClick={handleAddMessage}
                                aria-label="Send message"
                              >
                                <SendHorizontal className="size-4" />
                              </Button>
                            </div>
                          </div>
                          {!selected.messages?.some((m) => (m.from === "vet" || m.from === "doctor") && m.text.startsWith("Medicine recommended:")) && (
                            <>
                              <div className="space-y-2 pt-4 mt-4 border-t border-border/80">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <FileText className="size-3.5" />
                                    Request document
                                  </Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={requestDocAiLoading || !selected.diagnosis?.trim()}
                                    onClick={handleFillRequestDocWithAI}
                                    className="gap-1.5 text-primary hover:bg-primary/10 h-8 text-xs"
                                  >
                                    {requestDocAiLoading ? (
                                      <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                                    ) : (
                                      <Star className="size-3.5 shrink-0" />
                                    )}
                                    {requestDocAiLoading ? "Loading…" : "Fill with AI"}
                                  </Button>
                                </div>
                                <div className="rounded-md border border-border overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-muted/60 border-b border-border">
                                        <th className="text-left font-medium px-3 py-2">Document name</th>
                                        <th className="w-9" />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {docRequestRows.map((name, idx) => (
                                        <tr key={idx} className="border-b border-border/60 last:border-0">
                                          <td className="p-1.5">
                                            <Input
                                              placeholder="e.g. Lab report, X-ray"
                                              value={name}
                                              onChange={(e) =>
                                                setDocRequestRows((prev) =>
                                                  prev.map((v, i) => (i === idx ? e.target.value : v))
                                                )
                                              }
                                              className="h-9 border-border"
                                            />
                                          </td>
                                          <td className="p-1">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                              onClick={() =>
                                                setDocRequestRows((prev) =>
                                                  prev.length > 1 ? prev.filter((_, i) => i !== idx) : [""]
                                                )
                                              }
                                            >
                                              <Trash2 className="size-4" />
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => setDocRequestRows((prev) => [...prev, ""])}
                                  >
                                    <Plus className="size-4" />
                                    Add row
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!docRequestRows.some((d) => d.trim()) || actionLoading}
                                    onClick={handleRequestDocs}
                                  >
                                    Request all
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2 pt-4 mt-4 border-t border-border/80">
                                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <CalendarCheck className="size-3.5" />
                                  {selected.appointment?.scheduledAt ? "Reschedule appointment" : "Schedule appointment (optional)"}
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {(() => {
                                    const now = new Date();
                                    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                                    const selectedDateStr = appointmentDateTime
                                      ? appointmentDateTime.slice(0, 10)
                                      : selected.appointment?.scheduledAt
                                        ? (() => {
                                            const d = new Date(selected.appointment.scheduledAt);
                                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                                          })()
                                        : "";
                                    const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
                                    const timeMinForToday = `${String(in5Min.getHours()).padStart(2, "0")}:${String(in5Min.getMinutes()).padStart(2, "0")}`;
                                    return (
                                    <>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">Date</Label>
                                    <Input
                                      type="date"
                                      value={
                                        appointmentDateTime
                                          ? appointmentDateTime.slice(0, 10)
                                          : selected.appointment?.scheduledAt
                                            ? (() => {
                                                const d = new Date(selected.appointment.scheduledAt);
                                                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                                              })()
                                            : ""
                                      }
                                      min={todayLocal}
                                      onChange={(e) => {
                                        const d = e.target.value;
                                        const prev = appointmentDateTime || (selected.appointment?.scheduledAt ? (() => {
                                          const t = new Date(selected.appointment!.scheduledAt);
                                          return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
                                        })() : "");
                                        const now = new Date();
                                        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                                        const t = prev ? prev.slice(11, 16) : (d === today ? (() => {
                                          const in5 = new Date(now.getTime() + 5 * 60 * 1000);
                                          return `${String(in5.getHours()).padStart(2, "0")}:${String(in5.getMinutes()).padStart(2, "0")}`;
                                        })() : "09:00");
                                        setAppointmentDateTime(d ? `${d}T${t}` : "");
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">Time</Label>
                                    <Input
                                      type="time"
                                      value={
                                        appointmentDateTime
                                          ? appointmentDateTime.slice(11, 16)
                                          : selected.appointment?.scheduledAt
                                            ? (() => {
                                                const t = new Date(selected.appointment.scheduledAt);
                                                return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
                                              })()
                                            : ""
                                      }
                                      min={selectedDateStr === todayLocal ? timeMinForToday : undefined}
                                      onChange={(e) => {
                                        const t = e.target.value;
                                        const prev = appointmentDateTime || (selected.appointment?.scheduledAt ? (() => {
                                          const d = new Date(selected.appointment!.scheduledAt);
                                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                                        })() : "");
                                        const d = prev ? prev.slice(0, 10) : todayLocal;
                                        setAppointmentDateTime(t ? `${d}T${t}` : (prev ? prev.slice(0, 10) : ""));
                                      }}
                                    />
                                  </div>
                                    </>
                                    );
                                  })()}
                                </div>
                                {!selected.appointment?.scheduledAt && (
                                  <Input
                                    placeholder="Next steps or notes (optional)"
                                    value={nextStepsText}
                                    onChange={(e) => setNextStepsText(e.target.value)}
                                  />
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={actionLoading || (!selected.appointment?.scheduledAt && !appointmentDateTime)}
                                  onClick={selected.appointment?.scheduledAt ? handleRescheduleAppointment : handleScheduleAppointment}
                                >
                                  {selected.appointment?.scheduledAt ? "Reschedule appointment" : "Schedule appointment"}
                                </Button>
                              </div>
                              <div className="space-y-2 pt-4 mt-4 border-t border-border/80">
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Pill className="size-3.5" />
                                    Recommend medicine
                                  </Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={medicineAiLoading || !selected.diagnosis?.trim()}
                                    onClick={handleFillMedicineWithAI}
                                    className="gap-1.5 text-primary hover:bg-primary/10 h-8 text-xs"
                                  >
                                    {medicineAiLoading ? (
                                      <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                                    ) : (
                                      <Star className="size-3.5 shrink-0" />
                                    )}
                                    {medicineAiLoading ? "Loading…" : "Fill with AI"}
                                  </Button>
                                </div>
                                <div className="rounded-md border border-border overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-muted/60 border-b border-border">
                                        <th className="text-left font-medium px-3 py-2">Medicine</th>
                                        <th className="text-left font-medium px-3 py-2">Time duration</th>
                                        <th className="w-9" />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {medicineRows.map((row, idx) => (
                                        <tr key={idx} className="border-b border-border/60 last:border-0">
                                          <td className="p-1.5">
                                            <Input
                                              placeholder="Medicine name"
                                              value={row.medicine}
                                              onChange={(e) =>
                                                setMedicineRows((prev) =>
                                                  prev.map((r, i) => (i === idx ? { ...r, medicine: e.target.value } : r))
                                                )
                                              }
                                              className="h-9 border-border"
                                            />
                                          </td>
                                          <td className="p-1.5">
                                            <Input
                                              placeholder="e.g. 7 days, 2 weeks"
                                              value={row.duration}
                                              onChange={(e) =>
                                                setMedicineRows((prev) =>
                                                  prev.map((r, i) => (i === idx ? { ...r, duration: e.target.value } : r))
                                                )
                                              }
                                              className="h-9 border-border"
                                            />
                                          </td>
                                          <td className="p-1">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                              onClick={() =>
                                                setMedicineRows((prev) =>
                                                  prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ medicine: "", duration: "" }]
                                                )
                                              }
                                            >
                                              <Trash2 className="size-4" />
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => setMedicineRows((prev) => [...prev, { medicine: "", duration: "" }])}
                                  >
                                    <Plus className="size-4" />
                                    Add row
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!medicineRows.some((r) => r.medicine.trim()) || actionLoading}
                                    onClick={handleRecommendMedicineAndClose}
                                  >
                                    Recommend medicine and close
                                  </Button>
                                </div>
                                {medicineRows.some((r) => r.medicine.trim()) && (
                                  <div className="flex items-center gap-2 flex-wrap pt-2">
                                    <Label htmlFor="follow-up-email-medicine" className="text-xs text-muted-foreground whitespace-nowrap">
                                      Catchup with Patient
                                    </Label>
                                    <select
                                      id="follow-up-email-medicine"
                                      value={followUpEmailScheduledAt}
                                      onChange={(e) => setFollowUpEmailScheduledAt(e.target.value)}
                                      className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                      <option value="">Don&apos;t send</option>
                                      <option value="2 mins">In 2 mins</option>
                                      <option value="1 hour">In 1 hour</option>
                                      <option value="24 hours">In 24 hours</option>
                                      <option value="7 days">In 7 days</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                          <div className="pt-4 mt-4 border-t border-border/80 space-y-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={actionLoading}
                              onClick={handleCloseTicket}
                            >
                              <XCircle className="size-4 mr-1.5" />
                              Close consultation (no appointment)
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                  </div>
                )}
                {selected.status === "closed" && (
                  <div className="overflow-y-auto flex flex-col items-center justify-center p-8 bg-muted/5 border-l border-border">
                    <div className="rounded-2xl border border-border bg-background/80 px-8 py-10 text-center shadow-inner">
                      <p className="text-sm font-medium text-muted-foreground">This consultation is closed.</p>
                      <p className="text-xs text-muted-foreground/80 mt-1">View details on the left.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
