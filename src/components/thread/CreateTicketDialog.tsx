"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, Image as ImageIcon, Upload } from "lucide-react";
import { getUserId } from "@/lib/user-id";
import { toast } from "sonner";
import { useStreamContext } from "@/providers/Stream";
import { Badge } from "@/components/ui/badge";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { fileToContentBlock, isBase64ContentBlock, type ContentBlock } from "@/lib/multimodal-utils";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type TicketCategory = "general" | "artificial_insemination";

function labelToCategory(value: string | undefined): TicketCategory {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (
    normalized === "artificial_insemination" ||
    normalized === "ai" ||
    normalized === "artificial_insemenation"
  ) {
    return "artificial_insemination";
  }
  return "general";
}

function deriveCategoryFromDiagnosis(
  animalType: string,
  diagnosisSymptoms: string[],
  diagnosisRelevantMessages: string[],
  suggestedCategory: string | undefined,
): TicketCategory {
  const fromModel = labelToCategory(suggestedCategory);
  const isCow = animalType.trim().toLowerCase() === "cow";
  const haystack = [...diagnosisSymptoms, ...diagnosisRelevantMessages]
    .join(" ")
    .toLowerCase();
  const hasEstrusSignal = /\bestrus\b|\bheat\b|\bin heat\b/.test(haystack);
  if (isCow && hasEstrusSignal) return "artificial_insemination";
  return fromModel;
}

function getPatientDefaults() {
  return {
    name: process.env.NEXT_PUBLIC_USER_NAME ?? process.env.NEXT_PUBLIC_PATIENT_NAME ?? "",
    age: process.env.NEXT_PUBLIC_USER_AGE ?? process.env.NEXT_PUBLIC_PATIENT_AGE ?? "",
    gender: process.env.NEXT_PUBLIC_USER_GENDER ?? process.env.NEXT_PUBLIC_PATIENT_GENDER ?? "",
  };
}

function getAddressDefaults() {
  return {
    email: process.env.NEXT_PUBLIC_USER_EMAIL ?? process.env.NEXT_PUBLIC_PATIENT_EMAIL ?? "",
    phone: process.env.NEXT_PUBLIC_USER_PHONE ?? process.env.NEXT_PUBLIC_PATIENT_PHONE ?? "",
    address: process.env.NEXT_PUBLIC_USER_ADDRESS ?? process.env.NEXT_PUBLIC_PATIENT_ADDRESS ?? "",
    city: process.env.NEXT_PUBLIC_USER_CITY ?? process.env.NEXT_PUBLIC_PATIENT_CITY ?? "",
    state: process.env.NEXT_PUBLIC_USER_STATE ?? process.env.NEXT_PUBLIC_PATIENT_STATE ?? "",
    zip: process.env.NEXT_PUBLIC_USER_ZIP ?? process.env.NEXT_PUBLIC_PATIENT_ZIP ?? "",
    country: process.env.NEXT_PUBLIC_USER_COUNTRY ?? process.env.NEXT_PUBLIC_PATIENT_COUNTRY ?? "",
    patientId: process.env.NEXT_PUBLIC_USER_ID ?? process.env.NEXT_PUBLIC_PATIENT_ID ?? "",
  };
}

export function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTicketDialogProps) {
  const stream = useStreamContext();
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomInput, setSymptomInput] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [patientId, setPatientId] = useState("");
  const [animalType, setAnimalType] = useState<string>("Cow");
  const [submitting, setSubmitting] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisSymptoms, setDiagnosisSymptoms] = useState<string[]>([]);
  const [diagnosisDuration, setDiagnosisDuration] = useState("");
  const [diagnosisRelevantMessages, setDiagnosisRelevantMessages] = useState<string[]>([]);
  const [diagnosisSeverity, setDiagnosisSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [diagnosisAnimalType, setDiagnosisAnimalType] = useState<string>("");
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>("general");
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const [extraImages, setExtraImages] = useState<ContentBlock[]>([]);

  const chatImages = useMemo(() => {
    const blocks: ContentBlock[] = [];
    for (const msg of stream.messages) {
      if (!Array.isArray(msg.content)) continue;
      for (const b of msg.content) {
        if (isBase64ContentBlock(b)) blocks.push(b);
      }
    }
    // de-dupe by mime+data prefix
    const seen = new Set<string>();
    const deduped: ContentBlock[] = [];
    for (const b of blocks) {
      const key = `${b.mimeType}:${b.data.slice(0, 48)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(b);
    }
    return deduped.slice(0, 12);
  }, [stream.messages]);

  useEffect(() => {
    if (open) {
      const pd = getPatientDefaults();
      setPatientName(pd.name);
      setPatientAge(pd.age);
      setPatientGender(pd.gender);
      const ad = getAddressDefaults();
      setEmail(ad.email);
      setPhone(ad.phone);
      setAddress(ad.address);
      setCity(ad.city);
      setState(ad.state);
      setZip(ad.zip);
      setCountry(ad.country);
      setPatientId(ad.patientId);
      setAnimalType("Cow");
      setSymptoms([]);
      setSymptomInput("");
      setDiagnosisSymptoms([]);
      setDiagnosisDuration("");
      setDiagnosisRelevantMessages([]);
      setDiagnosisSeverity("medium");
      setDiagnosisAnimalType("");
      setTicketCategory("general");
      setExtraImages([]);

      const sessionId = stream.sessionId;
      const hasChatHistory = stream.messages.length > 0;
      if (sessionId && hasChatHistory) {
        setDiagnosisLoading(true);
        fetch("/api/tickets/ai-diagnosis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Failed to generate AI diagnosis");
            }
            const data = (await res.json()) as {
              symptoms?: string[];
              durationOfSymptoms?: string;
              relevantMessages?: string[];
              severity?: string;
              animalType?: string;
              ticketCategory?: string;
            };
            const nextDiagnosisSymptoms = Array.isArray(data.symptoms) ? data.symptoms : [];
            setDiagnosisSymptoms(nextDiagnosisSymptoms);
            setDiagnosisDuration(
              typeof data.durationOfSymptoms === "string"
                ? data.durationOfSymptoms
                : "",
            );
            const nextRelevantMessages = Array.isArray(data.relevantMessages)
              ? data.relevantMessages
              : [];
            setDiagnosisRelevantMessages(nextRelevantMessages);
            if (typeof data.severity === "string") {
              const sev = data.severity.toLowerCase();
              if (sev === "low" || sev === "medium" || sev === "high" || sev === "critical") {
                setDiagnosisSeverity(sev);
              } else {
                setDiagnosisSeverity("medium");
              }
            } else {
              setDiagnosisSeverity("medium");
            }

            if (typeof data.animalType === "string") {
              const at = data.animalType.trim();
              setDiagnosisAnimalType(at);
              if (at) {
                // Use AI-identified animal type to prefill the dropdown, but allow manual override.
                setAnimalType(at);
              }
              setTicketCategory(
                deriveCategoryFromDiagnosis(
                  at || animalType,
                  nextDiagnosisSymptoms,
                  nextRelevantMessages,
                  data.ticketCategory,
                ),
              );
            } else {
              setDiagnosisAnimalType("");
              setTicketCategory(
                deriveCategoryFromDiagnosis(
                  animalType,
                  nextDiagnosisSymptoms,
                  nextRelevantMessages,
                  data.ticketCategory,
                ),
              );
            }
          })
          .catch((err) => {
            console.error("AI diagnosis error:", err);
            toast.error(
              err instanceof Error
                ? err.message
                : "Failed to generate AI diagnosis",
            );
          })
          .finally(() => {
            setDiagnosisLoading(false);
          });
      }
    }
  }, [open, stream.sessionId, stream.messages.length]);

  const addSymptom = useCallback(() => {
    const t = symptomInput.trim();
    if (!t) return;
    setSymptoms((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setSymptomInput("");
  }, [symptomInput]);

  const removeSymptom = useCallback((s: string) => {
    setSymptoms((prev) => prev.filter((x) => x !== s));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    setSubmitting(true);
    try {
      const userId = getUserId();
      const attachments = [...chatImages, ...extraImages].slice(0, 24);
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          symptoms,
          animalType,
          category: ticketCategory,
          severity: diagnosisSeverity,
          diagnosis: {
            symptoms: diagnosisSymptoms,
            durationOfSymptoms: diagnosisDuration || undefined,
            relevantMessages: diagnosisRelevantMessages,
          },
          attachments,
          patientName: patientName.trim() || undefined,
          patientAge: patientAge.trim() || undefined,
          patientGender: patientGender.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
          country: country.trim() || undefined,
          patientId: patientId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create ticket");
      }
      toast.success("Ticket created");
      setSymptoms([]);
      setSymptomInput("");
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request consultation");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickImages = async (files: File[]) => {
    if (files.length === 0) return;
    const supported = files.filter((f) => f.type.startsWith("image/"));
    if (supported.length === 0) {
      toast.error("Please select image files (PNG/JPEG/WEBP/GIF).");
      return;
    }
    try {
      const blocks = await Promise.all(supported.slice(0, 8).map((f) => fileToContentBlock(f)));
      setExtraImages((prev) => [...prev, ...blocks].slice(0, 12));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read image");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/60 bg-muted/30">
          <DialogTitle className="text-xl font-semibold">Create Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Owner information */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                User information
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="patientName" className="text-sm font-medium text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    id="patientName"
                    value={patientName}
                    readOnly
                    placeholder="Name"
                    className="h-10 bg-muted/80 cursor-not-allowed border-border/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientAge" className="text-sm font-medium text-muted-foreground">
                    Age
                  </Label>
                  <Input
                    id="patientAge"
                    value={patientAge}
                    readOnly
                    placeholder="Age"
                    className="h-10 bg-muted/80 cursor-not-allowed border-border/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientGender" className="text-sm font-medium text-muted-foreground">
                    Gender
                  </Label>
                  <Input
                    id="patientGender"
                    value={patientGender}
                    readOnly
                    placeholder="Gender"
                    className="h-10 bg-muted/80 cursor-not-allowed border-border/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="animalType" className="text-sm font-medium text-muted-foreground">
                    Animal type
                  </Label>
                  <Input
                    id="animalType"
                    value={animalType}
                    onChange={(e) => setAnimalType(e.target.value)}
                    placeholder="e.g. cow, buffalo, goat"
                    className="h-10 bg-muted/50 border-border/80"
                  />
                  {diagnosisAnimalType && (
                    <p className="text-[11px] text-muted-foreground">
                      AI guess: <span className="font-medium">{diagnosisAnimalType}</span> (you can edit)
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientId" className="text-sm font-medium text-muted-foreground">
                  User ID
                </Label>
                <Input
                  id="patientId"
                  value={patientId}
                  readOnly
                  placeholder="User ID"
                  className="h-10 bg-muted/80 cursor-not-allowed border-border/80"
                />
              </div>
            </section>

            {/* Contact & location (editable) */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Contact & location
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address" className="text-sm font-medium text-muted-foreground">
                    Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Village, street, landmark…"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm font-medium text-muted-foreground">
                    City
                  </Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state" className="text-sm font-medium text-muted-foreground">
                    State
                  </Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip" className="text-sm font-medium text-muted-foreground">
                    ZIP
                  </Label>
                  <Input
                    id="zip"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="ZIP"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-sm font-medium text-muted-foreground">
                    Country
                  </Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium text-muted-foreground">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91…"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@email.com"
                    className="h-10"
                    disabled={submitting}
                  />
                </div>
              </div>
            </section>

            {/* Additional symptoms */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Ticket category
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={ticketCategory === "general" ? "default" : "outline"}
                  className="h-auto min-h-12 justify-start text-left px-4 py-3"
                  onClick={() => setTicketCategory("general")}
                  disabled={submitting}
                >
                  <span className="font-medium">General</span>
                </Button>
                <Button
                  type="button"
                  variant={ticketCategory === "artificial_insemination" ? "default" : "outline"}
                  className="h-auto min-h-12 justify-start text-left px-4 py-3"
                  onClick={() => setTicketCategory("artificial_insemination")}
                  disabled={submitting}
                >
                  <span className="font-medium">Artificial Insemination</span>
                </Button>
              </div>
              {stream.messages.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Category is auto-selected from AI diagnosis. You can still change it.
                </p>
              )}
            </section>

            {/* Additional symptoms */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Additional symptoms
              </h3>
              <div className="flex gap-3">
                <Input
                  value={symptomInput}
                  onChange={(e) => setSymptomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSymptom();
                    }
                  }}
                  placeholder="Add a symptom and press Enter or click +"
                  disabled={submitting}
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={addSymptom}
                  disabled={submitting || !symptomInput.trim()}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
              {symptoms.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {symptoms.map((s) => (
                    <li
                      key={s}
                      className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-foreground border border-primary/20 px-4 py-2 text-sm font-medium"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => removeSymptom(s)}
                        className="hover:text-destructive cursor-pointer rounded-full p-0.5 hover:bg-destructive/10 transition-colors"
                        disabled={submitting}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Diagnosis – always visible; AI pre-fills when there is chat history */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  Diagnosis
                </h3>
                {diagnosisLoading && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Analyzing chat…</span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Symptoms
                  </Label>
                {diagnosisSymptoms.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {diagnosisSymptoms.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="rounded-full px-3 py-1 text-xs"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    No AI-suggested symptoms yet.
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    AI-estimated severity
                  </Label>
                  <Badge
                    variant={
                      diagnosisSeverity === "critical"
                        ? "default"
                        : diagnosisSeverity === "high"
                        ? "default"
                        : diagnosisSeverity === "medium"
                        ? "secondary"
                        : "outline"
                    }
                    className="rounded-full px-3 py-1 text-xs capitalize"
                  >
                    {diagnosisSeverity}
                  </Badge>
                </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Duration of Symptoms
                  </Label>
                  <textarea
                    className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={diagnosisDuration}
                    onChange={(e) => setDiagnosisDuration(e.target.value)}
                    placeholder="How long the symptoms have been present."
                    disabled={diagnosisLoading}
                  />
                </div>
                {stream.messages.length > 0 && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Relevant Messages
                      </Label>
                      {diagnosisRelevantMessages.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {diagnosisRelevantMessages.map((msg) => (
                            <Badge
                              key={msg}
                              variant="outline"
                              className="rounded-full px-3 py-1 text-[11px] text-left max-w-full whitespace-normal break-words"
                            >
                              {msg}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          No AI-highlighted messages yet.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Images */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  Images
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    ref={imageUploadRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      await handlePickImages(files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => imageUploadRef.current?.click()}
                    disabled={submitting}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    Add images
                  </Button>
                </div>
              </div>

              {chatImages.length > 0 && (
                <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    From chat ({chatImages.length})
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {chatImages.map((b, idx) => (
                      <MultimodalPreview key={`chat-${idx}`} block={b} size="md" />
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Additional uploads ({extraImages.length})
                </p>
                {extraImages.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Optional. Add photos (wounds, reports, animal condition) to help the vet.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {extraImages.map((b, idx) => (
                      <MultimodalPreview
                        key={`extra-${idx}`}
                        block={b}
                        size="md"
                        removable
                        onRemove={() => setExtraImages((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Images are included with the ticket so admins and vets can view them.
              </p>
            </section>
          </div>

          <DialogFooter className="shrink-0 px-6 py-4 border-t border-border/60 bg-muted/20 flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[160px]">
              {submitting ? "Creating..." : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
