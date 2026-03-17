import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

/** Resolve templates from root public/scheduler-templates (when running from repo root). */
function getTemplatesDir(): string {
  const cwd = process.cwd();
  const dir = path.join(cwd, "public", "scheduler-templates");
  if (existsSync(path.join(dir, "medcare-appointment-booked.html"))) return dir;
  return cwd;
}

const templatesDir = getTemplatesDir();
const TEMPLATE_PATH = path.join(templatesDir, "medcare-appointment-booked.html");
const TEXT_TEMPLATE_PATH = path.join(templatesDir, "medcare-appointment-booked.txt");

export type AppointmentBookedVars = {
  patientName: string;
  appointmentDatetimeFormatted: string;
  doctorName: string;
  doctorSpecialization: string;
  requestedDocuments: string;
  /**
   * Optional override for the logo source (e.g. `cid:medcare-logo`).
   * Prefer using `cid:` attachments over base64 data URIs to avoid Gmail clipping.
   */
  logoSrc?: string;
};

let cachedHtmlTemplate: string | null = null;
let cachedTextTemplate: string | null = null;
let cachedHtmlCompiled:
  | Handlebars.TemplateDelegate<{
      patientName: string;
      appointmentDatetimeFormatted: string;
      doctorName: string;
      doctorSpecialization: string;
      requestedDocuments: string;
      logoSrc?: string;
    }>
  | null = null;
let cachedTextCompiled:
  | Handlebars.TemplateDelegate<{
      patientName: string;
      appointmentDatetimeFormatted: string;
      doctorName: string;
      doctorSpecialization: string;
      requestedDocuments: string;
    }>
  | null = null;

function getLogoSrc(): string {
  const url = process.env.LOGO_URL;
  if (url && url.trim()) return url.trim();
  return "";
}

function loadHtmlTemplate(): string {
  if (cachedHtmlTemplate) return cachedHtmlTemplate;
  if (!existsSync(TEMPLATE_PATH)) throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  cachedHtmlTemplate = readFileSync(TEMPLATE_PATH, "utf-8");
  return cachedHtmlTemplate;
}

function loadTextTemplate(): string {
  if (cachedTextTemplate) return cachedTextTemplate;
  if (!existsSync(TEXT_TEMPLATE_PATH)) throw new Error(`Text template not found: ${TEXT_TEMPLATE_PATH}`);
  cachedTextTemplate = readFileSync(TEXT_TEMPLATE_PATH, "utf-8");
  return cachedTextTemplate;
}

function getCompiledHtmlTemplate() {
  if (cachedHtmlCompiled) return cachedHtmlCompiled;
  cachedHtmlCompiled = Handlebars.compile(loadHtmlTemplate(), { strict: true });
  return cachedHtmlCompiled;
}

function getCompiledTextTemplate() {
  if (cachedTextCompiled) return cachedTextCompiled;
  cachedTextCompiled = Handlebars.compile(loadTextTemplate(), { strict: true });
  return cachedTextCompiled;
}

/** Context shared by both HTML and plain-text templates (single data model). */
function getTemplateContext(vars: AppointmentBookedVars) {
  const logoSrc = vars.logoSrc ?? getLogoSrc();
  return {
    patientName: vars.patientName,
    appointmentDatetimeFormatted: vars.appointmentDatetimeFormatted,
    doctorName: vars.doctorName,
    doctorSpecialization: vars.doctorSpecialization,
    requestedDocuments: vars.requestedDocuments,
    logoSrc: logoSrc || undefined,
  };
}

export function getAppointmentBookedHtml(vars: AppointmentBookedVars): string {
  const ctx = getTemplateContext(vars);
  return getCompiledHtmlTemplate()(ctx);
}

export function getAppointmentBookedText(vars: AppointmentBookedVars): string {
  const ctx = getTemplateContext(vars);
  return getCompiledTextTemplate()({
    patientName: ctx.patientName,
    appointmentDatetimeFormatted: ctx.appointmentDatetimeFormatted,
    doctorName: ctx.doctorName,
    doctorSpecialization: ctx.doctorSpecialization,
    requestedDocuments: ctx.requestedDocuments,
  });
}

/** Renders both HTML and plain-text from the same data (industry practice: one source of truth). */
export function getAppointmentBookedContent(vars: AppointmentBookedVars): { html: string; text: string } {
  return {
    html: getAppointmentBookedHtml(vars),
    text: getAppointmentBookedText(vars),
  };
}
