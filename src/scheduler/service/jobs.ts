import crypto from "node:crypto";
import { parseAbsoluteTimeMs } from "../parse";
import { computeNextRunAtMs } from "../schedule";
import type { Job, JobCreate, JobPatch, Schedule } from "../types";
import type { SchedulerState } from "./state";

const STUCK_RUN_MS = 2 * 60 * 60 * 1000;
const MAX_SCHEDULE_ERRORS = 3;

function resolveEveryAnchorMs(params: {
  schedule: { everyMs: number; anchorMs?: number };
  fallbackAnchorMs: number;
}) {
  const raw = params.schedule.anchorMs;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  return Math.max(0, Math.floor(params.fallbackAnchorMs));
}

export function findJobOrThrow(state: SchedulerState, id: string): Job {
  const job = state.store?.jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error(`unknown job id: ${id}`);
  }
  return job;
}

export function computeJobNextRunAtMs(job: Job, nowMs: number): number | undefined {
  if (!job.enabled) {
    return undefined;
  }
  if (job.schedule.kind === "every") {
    const anchorMs = resolveEveryAnchorMs({
      schedule: job.schedule,
      fallbackAnchorMs: job.createdAtMs,
    });
    return computeNextRunAtMs({ ...job.schedule, anchorMs }, nowMs);
  }
  if (job.schedule.kind === "at") {
    if (job.state.lastStatus === "ok" && job.state.lastRunAtMs) {
      return undefined;
    }
    const schedule = job.schedule as { at?: string; atMs?: number | string };
    const atMs =
      typeof schedule.atMs === "number" && Number.isFinite(schedule.atMs) && schedule.atMs > 0
        ? schedule.atMs
        : typeof schedule.atMs === "string"
          ? parseAbsoluteTimeMs(schedule.atMs)
          : typeof schedule.at === "string"
            ? parseAbsoluteTimeMs(schedule.at)
            : null;
    if (atMs === null) return undefined;
    // If run time is in the past, run soon so the job still fires (immediate send)
    if (atMs <= nowMs) return nowMs + 500;
    return atMs;
  }
  const next = computeNextRunAtMs(job.schedule, nowMs);
  if (next === undefined && job.schedule.kind === "cron") {
    const nextSecondMs = (Math.floor(nowMs / 1000) + 1) * 1000;
    return computeNextRunAtMs(job.schedule, nextSecondMs);
  }
  return next;
}

function recordScheduleError(state: SchedulerState, job: Job, err: unknown): boolean {
  const errorCount = (job.state.scheduleErrorCount ?? 0) + 1;
  job.state.scheduleErrorCount = errorCount;
  job.state.nextRunAtMs = undefined;
  job.state.lastError = `schedule error: ${String(err)}`;
  if (errorCount >= MAX_SCHEDULE_ERRORS) {
    job.enabled = false;
    state.deps.log.error(
      { jobId: job.id, name: job.name, errorCount, err: String(err) },
      "scheduler: auto-disabled job after repeated schedule errors",
    );
  } else {
    state.deps.log.warn(
      { jobId: job.id, name: job.name, errorCount, err: String(err) },
      "scheduler: failed to compute next run (skipping)",
    );
  }
  return true;
}

function normalizeJobTickState(params: {
  state: SchedulerState;
  job: Job;
  nowMs: number;
}): { changed: boolean; skip: boolean } {
  const { state, job, nowMs } = params;
  let changed = false;
  if (!job.state) {
    job.state = {};
    changed = true;
  }
  if (!job.enabled) {
    if (job.state.nextRunAtMs !== undefined) {
      job.state.nextRunAtMs = undefined;
      changed = true;
    }
    if (job.state.runningAtMs !== undefined) {
      job.state.runningAtMs = undefined;
      changed = true;
    }
    return { changed, skip: true };
  }
  const runningAt = job.state.runningAtMs;
  if (typeof runningAt === "number" && nowMs - runningAt > STUCK_RUN_MS) {
    state.deps.log.warn(
      { jobId: job.id, runningAtMs: runningAt },
      "scheduler: clearing stuck running marker",
    );
    job.state.runningAtMs = undefined;
    changed = true;
  }
  return { changed, skip: false };
}

function walkJobs(
  state: SchedulerState,
  fn: (params: { job: Job; nowMs: number }) => boolean,
): boolean {
  if (!state.store) {
    return false;
  }
  let changed = false;
  const now = state.deps.nowMs();
  for (const job of state.store.jobs) {
    const tick = normalizeJobTickState({ state, job, nowMs: now });
    if (tick.changed) changed = true;
    if (tick.skip) continue;
    if (fn({ job, nowMs: now })) changed = true;
  }
  return changed;
}

function recomputeJobNextRunAtMs(params: { state: SchedulerState; job: Job; nowMs: number }) {
  let changed = false;
  try {
    const newNext = computeJobNextRunAtMs(params.job, params.nowMs);
    if (params.job.state.nextRunAtMs !== newNext) {
      params.job.state.nextRunAtMs = newNext;
      changed = true;
    }
    if (params.job.state.scheduleErrorCount) {
      params.job.state.scheduleErrorCount = undefined;
      changed = true;
    }
  } catch (err) {
    if (recordScheduleError(params.state, params.job, err)) {
      changed = true;
    }
  }
  return changed;
}

export function recomputeNextRuns(state: SchedulerState): boolean {
  return walkJobs(state, ({ job, nowMs: now }) => {
    const nextRun = job.state.nextRunAtMs;
    const isDueOrMissing = nextRun === undefined || now >= nextRun;
    if (isDueOrMissing) {
      return recomputeJobNextRunAtMs({ state, job, nowMs: now });
    }
    return false;
  });
}

export function recomputeNextRunsForMaintenance(state: SchedulerState): boolean {
  return walkJobs(state, ({ job, nowMs: now }) => {
    if (job.state.nextRunAtMs === undefined) {
      return recomputeJobNextRunAtMs({ state, job, nowMs: now });
    }
    return false;
  });
}

export function nextWakeAtMs(state: SchedulerState): number | undefined {
  const jobs = state.store?.jobs ?? [];
  const enabled = jobs.filter((j) => j.enabled && typeof j.state.nextRunAtMs === "number");
  if (enabled.length === 0) return undefined;
  return enabled.reduce(
    (min, j) => Math.min(min, j.state.nextRunAtMs as number),
    enabled[0].state.nextRunAtMs as number,
  );
}

function trimName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("job name is required");
  }
  const name = raw.trim();
  if (!name) throw new Error("job name is required");
  return name;
}

export function createJob(state: SchedulerState, input: JobCreate): Job {
  const now = state.deps.nowMs();
  const id = crypto.randomUUID();
  const schedule: Schedule =
    input.schedule.kind === "every"
      ? {
          ...input.schedule,
          anchorMs: resolveEveryAnchorMs({
            schedule: input.schedule,
            fallbackAnchorMs: now,
          }),
        }
      : input.schedule;
  const deleteAfterRun =
    typeof input.deleteAfterRun === "boolean"
      ? input.deleteAfterRun
      : schedule.kind === "at"
        ? true
        : undefined;
  const enabled = typeof input.enabled === "boolean" ? input.enabled : true;
  const job: Job = {
    id,
    name: trimName(input.name),
    description: typeof input.description === "string" ? input.description.trim() || undefined : undefined,
    enabled,
    deleteAfterRun,
    createdAtMs: now,
    updatedAtMs: now,
    schedule,
    payload: input.payload && typeof input.payload === "object" ? { ...input.payload } : {},
    state: { ...input.state },
  };
  job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
  return job;
}

export function applyJobPatch(job: Job, patch: JobPatch) {
  if (patch.name !== undefined) {
    job.name = trimName(patch.name);
  }
  if (patch.description !== undefined) {
    job.description =
      typeof patch.description === "string" ? patch.description.trim() || undefined : patch.description;
  }
  if (typeof patch.enabled === "boolean") {
    job.enabled = patch.enabled;
  }
  if (typeof patch.deleteAfterRun === "boolean") {
    job.deleteAfterRun = patch.deleteAfterRun;
  }
  if (patch.schedule) {
    job.schedule = patch.schedule;
  }
  if (patch.payload && typeof patch.payload === "object") {
    job.payload = { ...job.payload, ...patch.payload };
  }
  if (patch.state) {
    job.state = { ...job.state, ...patch.state };
  }
}

export function isJobDue(job: Job, nowMs: number, opts: { forced: boolean }): boolean {
  if (!job.state) job.state = {};
  if (typeof job.state.runningAtMs === "number") return false;
  if (opts.forced) return true;
  return (
    job.enabled &&
    typeof job.state.nextRunAtMs === "number" &&
    nowMs >= job.state.nextRunAtMs
  );
}

function isRunnable(params: {
  job: Job;
  nowMs: number;
  skipJobIds?: ReadonlySet<string>;
  skipAtIfAlreadyRan?: boolean;
}): boolean {
  const { job, nowMs } = params;
  if (!job.state) job.state = {};
  if (!job.enabled) return false;
  if (params.skipJobIds?.has(job.id)) return false;
  if (typeof job.state.runningAtMs === "number") return false;
  if (
    params.skipAtIfAlreadyRan &&
    job.schedule.kind === "at" &&
    job.state.lastStatus
  ) {
    return false;
  }
  const next = job.state.nextRunAtMs;
  return typeof next === "number" && nowMs >= next;
}

export function collectRunnableJobs(
  state: SchedulerState,
  nowMs: number,
  opts?: { skipJobIds?: ReadonlySet<string>; skipAtIfAlreadyRan?: boolean },
): Job[] {
  if (!state.store) return [];
  return state.store.jobs.filter((job) =>
    isRunnable({
      job,
      nowMs,
      skipJobIds: opts?.skipJobIds,
      skipAtIfAlreadyRan: opts?.skipAtIfAlreadyRan,
    }),
  );
}
