import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

function getTemplatesDir(): string {
  const cwd = process.cwd();
  const dir = path.join(cwd, "public", "scheduler-templates");
  if (existsSync(path.join(dir, "medcare-ticket-created.html"))) return dir;
  return cwd;
}

const templatesDir = getTemplatesDir();
const HTML_PATH = path.join(templatesDir, "medcare-ticket-created.html");
const TEXT_PATH = path.join(templatesDir, "medcare-ticket-created.txt");

export type TicketCreatedVars = {
  patientName: string;
  urn: string;
  /** Optional one-line summary (e.g. "We've received your request."). */
  summary?: string;
  /** Submitted symptoms; shown as "Submitted symptoms" in the email. */
  symptoms?: string;
  /** Optional; shown as "Clinical notes" in template (diagnosis data, not labeled "AI diagnosis"). */
  clinicalNotes?: string;
  /** Logo src for HTML (e.g. cid:medcare-logo or a URL). When set, template shows the logo. */
  logoSrc?: string;
};

let cachedHtml: string | null = null;
let cachedText: string | null = null;
let compiledHtml: Handlebars.TemplateDelegate<TicketCreatedVars> | null = null;
let compiledText: Handlebars.TemplateDelegate<TicketCreatedVars> | null = null;

function loadHtml(): string {
  if (cachedHtml) return cachedHtml;
  if (!existsSync(HTML_PATH)) throw new Error(`Template not found: ${HTML_PATH}`);
  cachedHtml = readFileSync(HTML_PATH, "utf-8");
  return cachedHtml;
}

function loadText(): string {
  if (cachedText) return cachedText;
  if (!existsSync(TEXT_PATH)) throw new Error(`Text template not found: ${TEXT_PATH}`);
  cachedText = readFileSync(TEXT_PATH, "utf-8");
  return cachedText;
}

export function getTicketCreatedHtml(vars: TicketCreatedVars): string {
  if (!compiledHtml) compiledHtml = Handlebars.compile(loadHtml(), { strict: true });
  return compiledHtml(vars);
}

export function getTicketCreatedText(vars: TicketCreatedVars): string {
  if (!compiledText) compiledText = Handlebars.compile(loadText(), { strict: true });
  return compiledText(vars);
}

export function getTicketCreatedContent(vars: TicketCreatedVars): { html: string; text: string } {
  return {
    html: getTicketCreatedHtml(vars),
    text: getTicketCreatedText(vars),
  };
}
