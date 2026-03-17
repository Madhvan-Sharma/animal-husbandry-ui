/**
 * Scheduler: function-call API for scheduling emails from anywhere in the repo.
 * Import and call these from API routes, server actions, or any server code.
 *
 * Usage:
 *   import { scheduleAppointmentEmail, scheduleTicketCreatedEmail } from "@/lib/scheduler";
 *
 *   await scheduleTicketCreatedEmail({ urn, patientName, email, ... });
 *   await scheduleAppointmentEmail({ patientName, patientEmail, appointmentDatetime, ... });
 *
 * No HTTP API: the scheduler runs in-process. Set SMTP_* in .env.local. EMAIL_TO is the env variable to which emails are sent.
 * Logo: uses public/logo.png by default (attached as inline image). For best display in all email clients, set LOGO_URL to a public URL (e.g. https://yourdomain.com/logo.png).
 */

import path from "node:path";
import { existsSync } from "node:fs";
import {
  Scheduler,
  createMedcareEmailExecutor,
  scheduleAppointmentEmail as scheduleAppointmentEmailImpl,
  scheduleTicketCreatedEmail as scheduleTicketCreatedEmailImpl,
  scheduleFollowUpEmail as scheduleFollowUpEmailImpl,
  type ScheduleAppointmentEmailOptions,
  type ScheduleTicketCreatedEmailOptions,
  type ScheduleFollowUpEmailOptions,
} from "@/scheduler";

type SchedulerInstance = InstanceType<typeof Scheduler>;

declare global {
  // eslint-disable-next-line no-var
  var __vetaiScheduler: SchedulerInstance | undefined;
}

async function getScheduler(): Promise<SchedulerInstance> {
  if (global.__vetaiScheduler) {
    if (typeof global.__vetaiScheduler.triggerTimerTick === "function") {
      void global.__vetaiScheduler.triggerTimerTick();
    }
    return global.__vetaiScheduler;
  }

  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const transport = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "1",
    requireTLS: process.env.SMTP_REQUIRE_TLS === "1" || port === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const rawFrom = (process.env.SMTP_FROM ?? "").trim();
  const from = /@/.test(rawFrom) ? rawFrom : `noreply@${rawFrom}`;

  const storePath = path.join(process.cwd(), "data", "scheduler-email-store.json");
  // Logo: public/logo.png (or set LOGO_URL in .env for a public URL, which works in all email clients)
  const logoPath = path.resolve(process.cwd(), "public", "logo.png");

  const log = {
    debug: (o: unknown, msg?: string) => console.debug("[scheduler]", msg ?? o),
    info: (o: unknown, msg?: string) => console.log("[scheduler]", msg ?? o),
    warn: (o: unknown, msg?: string) => console.warn("[scheduler]", msg ?? o),
    error: (o: unknown, msg?: string) => console.error("[scheduler]", msg ?? o),
  };

  const scheduler = new Scheduler({
    storePath,
    enabled: true,
    log,
    executeJob: createMedcareEmailExecutor({
      transport,
      from,
      log,
      logoPath: existsSync(logoPath) ? logoPath : null,
      logoUrl: process.env.LOGO_URL?.trim(),
    }),
  });

  await scheduler.start();
  global.__vetaiScheduler = scheduler;
  void scheduler.triggerTimerTick();
  return scheduler;
}

/**
 * Schedule an appointment confirmation email to the patient.
 * Call from anywhere (e.g. when a doctor schedules an appointment).
 */
export async function scheduleAppointmentEmail(
  options: ScheduleAppointmentEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  const scheduler = await getScheduler();
  return scheduleAppointmentEmailImpl(scheduler, options);
}

/**
 * Schedule a "ticket created" confirmation email to the patient.
 * Call from anywhere (e.g. when a patient creates a ticket).
 */
export async function scheduleTicketCreatedEmail(
  options: ScheduleTicketCreatedEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  const scheduler = await getScheduler();
  return scheduleTicketCreatedEmailImpl(scheduler, options);
}

/**
 * Schedule a follow-up email (e.g. "How is your health now?") at a given time.
 * Set FOLLOW_UP_EMAIL_SCHEDULED_AT in .env.local (ISO datetime) and call when a ticket is closed.
 */
export async function scheduleFollowUpEmail(
  options: ScheduleFollowUpEmailOptions
): Promise<{ id: string; nextRunAtMs?: number }> {
  const scheduler = await getScheduler();
  return scheduleFollowUpEmailImpl(scheduler, options);
}
