import type { Job, Logger, RunResult, StoreFile } from "../types";

export type SchedulerDeps = {
  nowMs?: () => number;
  log: Logger;
  storePath: string;
  enabled: boolean;
  /** Called when a job is due. Return status so the scheduler can update state and backoff. */
  executeJob: (job: Job) => Promise<RunResult>;
};

export type SchedulerState = {
  deps: SchedulerDeps & { nowMs: () => number };
  store: StoreFile | null;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  op: Promise<unknown>;
  warnedDisabled: boolean;
  storeLoadedAtMs: number | null;
  storeFileMtimeMs: number | null;
};

export function createState(deps: SchedulerDeps): SchedulerState {
  return {
    deps: { ...deps, nowMs: deps.nowMs ?? (() => Date.now()) },
    store: null,
    timer: null,
    running: false,
    op: Promise.resolve(),
    warnedDisabled: false,
    storeLoadedAtMs: null,
    storeFileMtimeMs: null,
  };
}

export type StatusSummary = {
  enabled: boolean;
  storePath: string;
  jobs: number;
  nextWakeAtMs: number | null;
};

export type RunOutcome = { ok: true; ran: true } | { ok: true; ran: false; reason: string } | { ok: false };
