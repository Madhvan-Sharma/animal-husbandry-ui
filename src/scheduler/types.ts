/**
 * Schedule: one-shot at a time, repeat every N ms, or cron expression.
 */
export type Schedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type JobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  scheduleErrorCount?: number;
};

/**
 * A scheduled job. payload is generic — use it for handler-specific data
 * (e.g. email: { to, subject, body }).
 */
export type Job = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: Schedule;
  /** Handler-specific data (e.g. SMTP options, recipient, subject, body). */
  payload: Record<string, unknown>;
  state: JobState;
};

export type StoreFile = {
  version: 1;
  jobs: Job[];
};

export type JobCreate = Omit<Job, "id" | "createdAtMs" | "updatedAtMs" | "state"> & {
  state?: Partial<JobState>;
};

export type JobPatch = Partial<
  Omit<Job, "id" | "createdAtMs" | "state" | "payload">
> & {
  payload?: Record<string, unknown>;
  state?: Partial<JobState>;
};

export type RunStatus = "ok" | "error" | "skipped";

export type RunResult = { status: RunStatus; error?: string };

export type Logger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
