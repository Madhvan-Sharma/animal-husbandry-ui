import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

function getTemplatesDir(): string {
  const cwd = process.cwd();
  const dir = path.join(cwd, "public", "scheduler-templates");
  if (existsSync(path.join(dir, "medcare-follow-up.html"))) return dir;
  return cwd;
}

const templatesDir = getTemplatesDir();
const HTML_PATH = path.join(templatesDir, "medcare-follow-up.html");
const TEXT_PATH = path.join(templatesDir, "medcare-follow-up.txt");

export type FollowUpVars = {
  patientName: string;
  followUpLink: string;
  /** Logo src for HTML (e.g. cid:medcare-logo or a URL). */
  logoSrc?: string;
  /** Formatted appointment date (e.g. "February 21, 2026 at 10:00 AM"). Omit if no appointment. */
  appointmentDateFormatted?: string;
  /** Human-readable "your last appointment was X" (e.g. "3 days ago", "yesterday", "today"). Omit if no appointment. */
  daysSinceAppointmentText?: string;
  doctorName?: string;
  doctorSpecialization?: string;
  /** Warning message from doctor suggestion flow; included at end of email. */
  warningMessage?: string;
};

function loadHtml(): string {
  if (!existsSync(HTML_PATH)) throw new Error(`Template not found: ${HTML_PATH}`);
  return readFileSync(HTML_PATH, "utf-8");
}

function loadText(): string {
  if (!existsSync(TEXT_PATH)) throw new Error(`Text template not found: ${TEXT_PATH}`);
  return readFileSync(TEXT_PATH, "utf-8");
}

export function getFollowUpHtml(vars: FollowUpVars): string {
  return Handlebars.compile(loadHtml(), { strict: true })(vars);
}

export function getFollowUpText(vars: FollowUpVars): string {
  return Handlebars.compile(loadText(), { strict: true })(vars);
}

export function getFollowUpContent(vars: FollowUpVars): { html: string; text: string } {
  return {
    html: getFollowUpHtml(vars),
    text: getFollowUpText(vars),
  };
}
