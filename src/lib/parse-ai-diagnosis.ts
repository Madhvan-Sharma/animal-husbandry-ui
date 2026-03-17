/**
 * Parse AI diagnosis text into key/value pairs.
 * Values that look like ['a', 'b'] become arrays.
 * Shared by doctor dashboard and patient Create Ticket (Request Consultation) form.
 */
export function parseAiDiagnosis(
  text: string | undefined,
): { key: string; value: string | string[] }[] {
  if (!text?.trim()) return [];
  const lines = text.trim().split(/\n/);
  return lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { key: line.trim(), value: "" };
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      const listMatch = value.match(/^\[([\s\S]*)\]$/);
      if (listMatch) {
        const inner = listMatch[1].trim();
        if (!inner) return { key, value: [] as string[] };
        const items = inner
          .split(/',\s*'|",\s*"|,\s*/)
          .map((s) => s.replace(/^['"]\s*|\s*['"]$/g, "").trim())
          .filter(Boolean);
        return { key, value: items };
      }
      return { key, value };
    })
    .filter((x) => x.key);
}

/** Display label for a diagnosis key (e.g. "User History" → "Relevant user messages"). */
export function getDiagnosisFieldLabel(key: string): string {
  if (key.trim().toLowerCase() === "user history") {
    return "Relevant user messages";
  }
  return key.replace(/([A-Z])/g, " $1").replace(/\s+/g, " ").trim();
}

/** Keys that are stored in diagnosis but only used on doctor dashboard (hidden from patient ticket form). */
export const DOCTOR_ONLY_DIAGNOSIS_KEYS = ["suggestion", "recommendedmedicines", "requesteddocuments"];

function diagnosisKeyMatches(key: string, oneOf: string[]): boolean {
  const k = key.trim().toLowerCase();
  return oneOf.includes(k);
}

/** Parse diagnosis and return fields used to pre-fill doctor dashboard (Reply/Suggestion only). */
export function getDoctorPrefillFromDiagnosis(
  text: string | undefined,
): { suggestion: string } {
  const parsed = parseAiDiagnosis(text);
  let suggestion = "";
  for (const { key, value } of parsed) {
    const k = key.trim().toLowerCase();
    if (k === "suggestion") {
      suggestion = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      break;
    }
  }
  return { suggestion };
}

/** Whether this diagnosis key should be hidden on the patient dashboard ticket form. */
export function isDoctorOnlyDiagnosisKey(key: string): boolean {
  return diagnosisKeyMatches(key, DOCTOR_ONLY_DIAGNOSIS_KEYS);
}

/** Keys to hide in the doctor ticket sidebar (used for prefill only or no longer in API output). */
const DOCTOR_SIDEBAR_HIDDEN_KEYS = ["suggestion", "recommendedmedicines", "requesteddocuments"];

/** Whether this diagnosis key should be hidden in the doctor view ticket sidebar. */
export function isHiddenInDoctorSidebar(key: string): boolean {
  return diagnosisKeyMatches(key, DOCTOR_SIDEBAR_HIDDEN_KEYS);
}

/** Parsed output from the doctor suggestion Langflow workflow (DoctorSuggestion, MedicineRecommended, RequestedDocuments, WarningMessage). */
export interface DoctorSuggestionPrefill {
  doctorSuggestion: string;
  medicineRecommended: string[];
  requestedDocuments: string[];
  warningMessage: string;
}

/** Parse doctor suggestion workflow response text into prefill fields for reply, medicines, and documents. */
export function getDoctorSuggestionPrefill(text: string | undefined): DoctorSuggestionPrefill {
  const result: DoctorSuggestionPrefill = {
    doctorSuggestion: "",
    medicineRecommended: [],
    requestedDocuments: [],
    warningMessage: "",
  };
  if (!text?.trim()) return result;
  const parsed = parseAiDiagnosis(text);
  for (const { key, value } of parsed) {
    const k = key.trim().toLowerCase();
    const str = Array.isArray(value) ? value.join(" ").trim() : String(value ?? "").trim();
    const arr = Array.isArray(value) ? value : [];
    if (k === "doctorsuggestion") result.doctorSuggestion = str;
    else if (k === "medicinerecommended") result.medicineRecommended = arr;
    else if (k === "requesteddocuments") result.requestedDocuments = arr;
    else if (k === "warningmessage") result.warningMessage = str;
  }
  return result;
}
