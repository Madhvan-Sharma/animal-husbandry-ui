import { readFileSync, existsSync } from "node:fs";
import type { Job, RunResult } from "./types";
import type { Logger } from "./types";
import type { Scheduler } from "./scheduler";
import { getAppointmentBookedContent } from "./appointment-email";
import { getTicketCreatedContent } from "./ticket-email";
import { getFollowUpContent } from "./follow-up-email";
import { formatAppointmentDateTime } from "./format-datetime";

/** Given appointment date and "now" (e.g. when email sends), return text like "3 days ago", "yesterday", "today". */
function getDaysSinceAppointmentText(appointmentDate: Date, now: Date): string {
  const start = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "recently";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

function buildFollowUpFallbackText(
  patientName: string,
  followUpLink: string,
  appointmentDateFormatted?: string,
  daysSinceText?: string,
  doctorName?: string,
  doctorSpecialization?: string,
  warningMessage?: string
): string {
  const lines: string[] = [
    `Hi ${patientName},`,
    "",
  ];
  if (appointmentDateFormatted && daysSinceText) {
    lines.push(`Your last appointment was ${daysSinceText}.`);
    lines.push("");
    lines.push(`Appointment date: ${appointmentDateFormatted}`);
    if (doctorName) lines.push(`Doctor name: ${doctorName}`);
    if (doctorSpecialization) lines.push(`Specialization: ${doctorSpecialization}`);
    lines.push("");
  }
  if (warningMessage) {
    lines.push("---");
    lines.push(warningMessage);
    lines.push("");
  }
  lines.push("Take care,");
  lines.push("The VetAI team");
  return lines.join("\n");
}

export type ScheduleAppointmentEmailOptions = {
  patientName: string;
  patientEmail: string;
  appointmentDatetime: Date | string;
  doctorName: string;
  doctorSpecialization?: string;
  requestedDocuments?: string;
  delayMs?: number;
};

export type ScheduleTicketCreatedEmailOptions = {
  urn: string;
  patientName: string;
  email?: string;
  patientAge?: number | string;
  patientGender?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  severity?: string;
  symptoms?: string;
  clinicalNotes?: string;
  createdAt?: Date;
  delayMs?: number;
};

export type MedcareEmailExecutorDeps = {
  transport: { sendMail: (opts: { from: string; to: string; subject: string; text: string; html: string; attachments?: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> }) => Promise<unknown> };
  from: string;
  log: Logger;
  logoPath: string | null;
  logoUrl?: string;
};

export function createMedcareEmailExecutor(deps: MedcareEmailExecutorDeps) {
  const { transport, from, log, logoPath, logoUrl } = deps;

  return async function executeJob(job: Job): Promise<RunResult> {
    const payload = job.payload as Record<string, unknown>;
    const type = String(payload.type ?? "").trim().toLowerCase();
    // All emails are sent to EMAIL_TO for now
    const to = process.env.EMAIL_TO?.trim();

    if (!to) {
      return { status: "error", error: "EMAIL_TO env variable is required for email job" };
    }

    if (type === "follow_up") {
      const patientName = String(payload.patientName ?? "Patient");
      const followUpLink = (process.env.FOLLOW_UP_LINK_BASE_URL ?? "http://localhost:3000").trim();
      const subject = "Your appointment reminder | VetAI";

      const appointmentDateRaw = payload.appointmentDate as string | undefined;
      const appointmentDate = appointmentDateRaw ? new Date(appointmentDateRaw) : null;
      const now = new Date();
      const appointmentDateFormatted =
        appointmentDate && !Number.isNaN(appointmentDate.getTime())
          ? formatAppointmentDateTime(appointmentDate)
          : undefined;
      const daysSinceAppointmentText =
        appointmentDate && !Number.isNaN(appointmentDate.getTime())
          ? getDaysSinceAppointmentText(appointmentDate, now)
          : undefined;
      const doctorName = String(payload.doctorName ?? "").trim() || undefined;
      const doctorSpecialization = String(payload.doctorSpecialization ?? "").trim() || undefined;
      const warningMessage = String(payload.warningMessage ?? "").trim() || undefined;

      const attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> = [];
      let logoSrc = (logoUrl ?? "").trim();
      if (!logoSrc && logoPath && existsSync(logoPath)) {
        const cid = "medcare-logo";
        attachments.push({
          filename: "logo.png",
          content: readFileSync(logoPath),
          cid,
          contentType: "image/png",
        });
        logoSrc = `cid:${cid}`;
      }

      let html: string;
      let text: string;
      try {
        const content = getFollowUpContent({
          patientName,
          followUpLink,
          logoSrc: logoSrc || undefined,
          appointmentDateFormatted,
          daysSinceAppointmentText,
          doctorName,
          doctorSpecialization,
          warningMessage,
        });
        html = content.html;
        text = content.text;
      } catch (err) {
        log.warn({ err: String(err) }, "scheduler: follow-up template failed, using fallback");
        text = buildFollowUpFallbackText(
          patientName,
          followUpLink,
          appointmentDateFormatted,
          daysSinceAppointmentText,
          doctorName,
          doctorSpecialization,
          warningMessage
        );
        html = `<!DOCTYPE html><html><body style="font-family: sans-serif;">${text.replace(/\n/g, "<br>\n")}</body></html>`;
      }
      try {
        await transport.sendMail({
          from,
          to,
          subject,
          text,
          html,
          ...(attachments.length ? { attachments } : {}),
        });
        return { status: "ok" };
      } catch (err) {
        return { status: "error", error: String(err) };
      }
    }

    if (type === "appointment_booked") {
      const patientName = String(payload.patientName ?? "Patient");
      const appointmentDatetimeFormatted = String(payload.appointmentDatetimeFormatted ?? "");
      const doctorName = String(payload.doctorName ?? "");
      const doctorSpecialization = String(payload.doctorSpecialization ?? "");
      const requestedDocuments = String(payload.requestedDocuments ?? "None");

      const subject = "Your appointment at VetAI is confirmed";

      const attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> = [];
      let logoSrc = (logoUrl ?? "").trim();
      if (!logoSrc && logoPath && existsSync(logoPath)) {
        const cid = "medcare-logo";
        attachments.push({
          filename: "logo.png",
          content: readFileSync(logoPath),
          cid,
          contentType: "image/png",
        });
        logoSrc = `cid:${cid}`;
      }

      const templateVars = {
        patientName,
        appointmentDatetimeFormatted,
        doctorName,
        doctorSpecialization,
        requestedDocuments,
        logoSrc: logoSrc || undefined,
      };

      let html: string;
      let text: string;
      try {
        const content = getAppointmentBookedContent(templateVars);
        text = content.text;
        html = content.html;
      } catch (err) {
        log.warn({ err: String(err) }, "scheduler: appointment template failed, using fallback");
        text =
          `Hi ${patientName},\nYour appointment at VetAI is confirmed.\n\n` +
          `Date & time: ${appointmentDatetimeFormatted}\n` +
          `Doctor: ${doctorName}\n` +
          `Specialization: ${doctorSpecialization}\n` +
          `Requested documents: ${requestedDocuments}\n\n` +
          "The VetAI team";
        html = `<!DOCTYPE html><html><body style="font-family: sans-serif;">${text.replace(/\n/g, "<br>\n")}</body></html>`;
      }
      if (!html?.trim()) {
        html = `<!DOCTYPE html><html><body style="font-family: sans-serif;"><p>${(text || "").replace(/\n/g, "</p><p>")}</p></body></html>`;
      }

      try {
        await transport.sendMail({
          from,
          to,
          subject,
          text,
          html,
          ...(attachments.length ? { attachments } : {}),
        });
        return { status: "ok" };
      } catch (err) {
        return { status: "error", error: String(err) };
      }
    }

    if (type === "ticket_created") {
      const patientName = String(payload.patientName ?? "Patient");
      const urn = String(payload.urn ?? "");
      const summary = payload.summary != null ? String(payload.summary) : undefined;
      const symptoms = payload.symptoms != null ? String(payload.symptoms) : undefined;
      const clinicalNotes = payload.clinicalNotes != null ? String(payload.clinicalNotes) : undefined;

      const subject = "Your consultation request has been created | VetAI";

      const attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> = [];
      let logoSrc = (logoUrl ?? "").trim();
      if (!logoSrc && logoPath && existsSync(logoPath)) {
        const cid = "medcare-logo";
        attachments.push({
          filename: "logo.png",
          content: readFileSync(logoPath),
          cid,
          contentType: "image/png",
        });
        logoSrc = `cid:${cid}`;
      }

      let html: string;
      let text: string;
      try {
        const content = getTicketCreatedContent({
          patientName,
          urn,
          summary,
          symptoms,
          clinicalNotes,
          logoSrc: logoSrc || undefined,
        });
        html = content.html;
        text = content.text;
      } catch (err) {
        log.warn({ err: String(err) }, "scheduler: ticket template failed, using fallback");
        text = `Hi ${patientName},\n\nYour consultation request has been created.\n\nTicket reference (URN): ${urn}\n\n${symptoms ? `Submitted symptoms: ${symptoms}\n\n` : ""}We will get back to you shortly.\n\nThe VetAI team`;
        html = `<!DOCTYPE html><html><body style="font-family: sans-serif;">${text.replace(/\n/g, "<br>\n")}</body></html>`;
      }

      try {
        await transport.sendMail({
          from,
          to,
          subject,
          text,
          html,
          ...(attachments.length ? { attachments } : {}),
        });
        return { status: "ok" };
      } catch (err) {
        return { status: "error", error: String(err) };
      }
    }

    return { status: "error", error: `Unknown email type: ${type}` };
  };
}

export type ScheduleFollowUpEmailOptions = {
  patientName: string;
  /** When to send the email (e.g. from FOLLOW_UP_EMAIL_SCHEDULED_AT in env). */
  scheduledAt: Date;
  /** Appointment date/time (if any) for "your appointment is coming in X" and listing in email. */
  appointmentDate?: Date | string;
  doctorName?: string;
  doctorSpecialization?: string;
  /** Warning message from doctor suggestion flow (NEXT_PUBLIC_DOCTOR_SUGGESTION_FLOW_ID); included at end of email. */
  warningMessage?: string;
};

export async function scheduleAppointmentEmail(
  scheduler: InstanceType<typeof Scheduler>,
  options: ScheduleAppointmentEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  const date = typeof options.appointmentDatetime === "string"
    ? new Date(options.appointmentDatetime)
    : options.appointmentDatetime;
  const appointmentDatetimeFormatted = formatAppointmentDateTime(date);
  const atMs = date.getTime();
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const runAt = atMs - 24 * 60 * 60 * 1000 < Date.now() ? Date.now() + delayMs : atMs;

  const job = await scheduler.add({
    name: "appointment-booked-email",
    description: `Appointment confirmation (to EMAIL_TO)`,
    enabled: true,
    deleteAfterRun: true,
    schedule: { kind: "at", at: new Date(runAt).toISOString() },
    payload: {
      type: "appointment_booked",
      to: process.env.EMAIL_TO,
      patientName: options.patientName,
      appointmentDatetimeFormatted,
      doctorName: options.doctorName,
      doctorSpecialization: options.doctorSpecialization ?? "General",
      requestedDocuments: options.requestedDocuments ?? "None",
    },
  });
  return { id: job.id, nextRunAtMs: job.state.nextRunAtMs };
}

export async function scheduleTicketCreatedEmail(
  scheduler: InstanceType<typeof Scheduler>,
  options: ScheduleTicketCreatedEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  if (!process.env.EMAIL_TO?.trim()) {
    throw new Error("scheduleTicketCreatedEmail: EMAIL_TO env variable is required");
  }
  // Use at least 1s in future so the scheduler assigns nextRunAtMs; "immediate" still runs on next tick via schedule logic
  const delayMs = Math.max(0, options.delayMs ?? 1000);
  const runAt = Date.now() + delayMs;

  const job = await scheduler.add({
    name: "ticket-created-email",
    description: `Consultation request confirmation (to EMAIL_TO)`,
    enabled: true,
    deleteAfterRun: true,
    schedule: { kind: "at", at: new Date(runAt).toISOString() },
    payload: {
      type: "ticket_created",
      to: process.env.EMAIL_TO,
      patientName: options.patientName,
      urn: options.urn,
      summary: "We've received your request and will get back to you shortly.",
      symptoms: options.symptoms,
      clinicalNotes: options.clinicalNotes,
    },
  });
  return { id: job.id, nextRunAtMs: job.state.nextRunAtMs };
}

export async function scheduleFollowUpEmail(
  scheduler: InstanceType<typeof Scheduler>,
  options: ScheduleFollowUpEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  const appointmentDate = options.appointmentDate
    ? (typeof options.appointmentDate === "string" ? options.appointmentDate : options.appointmentDate.toISOString())
    : undefined;
  const job = await scheduler.add({
    name: "follow-up-email",
    description: `Follow-up: appointment reminder + catchup (to EMAIL_TO)`,
    enabled: true,
    deleteAfterRun: true,
    schedule: { kind: "at", at: options.scheduledAt.toISOString() },
    payload: {
      type: "follow_up",
      patientName: options.patientName,
      appointmentDate,
      doctorName: options.doctorName ?? "",
      doctorSpecialization: options.doctorSpecialization ?? "",
      warningMessage: options.warningMessage ?? "",
    },
  });
  return { id: job.id, nextRunAtMs: job.state.nextRunAtMs };
}
