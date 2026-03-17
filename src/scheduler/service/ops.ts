import type { JobCreate, JobPatch } from "../types";
import {
  applyJobPatch,
  computeJobNextRunAtMs,
  createJob,
  findJobOrThrow,
  isJobDue,
  nextWakeAtMs,
  recomputeNextRuns,
  recomputeNextRunsForMaintenance,
} from "./jobs";
import { locked } from "./locked";
import type { SchedulerState } from "./state";
import { ensureLoaded, persist, warnIfDisabled } from "./store";
import { armTimer, executeJob, onTimer, runMissedJobs, stopTimer } from "./timer";

async function ensureLoadedForRead(state: SchedulerState) {
  await ensureLoaded(state, { skipRecompute: true });
  if (!state.store) return;
  const changed = recomputeNextRunsForMaintenance(state);
  if (changed) await persist(state);
}

export async function start(state: SchedulerState) {
  await locked(state, async () => {
    if (!state.deps.enabled) {
      state.deps.log.info({ enabled: false }, "scheduler: disabled");
      return;
    }
    await ensureLoaded(state, { skipRecompute: true });
    const jobs = state.store?.jobs ?? [];
    const startupInterruptedJobIds = new Set<string>();
    for (const job of jobs) {
      if (typeof job.state.runningAtMs === "number") {
        state.deps.log.warn(
          { jobId: job.id, runningAtMs: job.state.runningAtMs },
          "scheduler: clearing stale running marker on startup",
        );
        job.state.runningAtMs = undefined;
        startupInterruptedJobIds.add(job.id);
      }
    }
    await runMissedJobs(state, { skipJobIds: startupInterruptedJobIds });
    recomputeNextRuns(state);
    await persist(state);
    armTimer(state);
    state.deps.log.info(
      {
        enabled: true,
        jobs: state.store?.jobs.length ?? 0,
        nextWakeAtMs: nextWakeAtMs(state) ?? null,
      },
      "scheduler: started",
    );
  });
}

export function stop(state: SchedulerState) {
  stopTimer(state);
}

export async function status(state: SchedulerState) {
  return await locked(state, async () => {
    await ensureLoadedForRead(state);
    return {
      enabled: state.deps.enabled,
      storePath: state.deps.storePath,
      jobs: state.store?.jobs.length ?? 0,
      nextWakeAtMs: state.deps.enabled ? (nextWakeAtMs(state) ?? null) : null,
    };
  });
}

export async function list(state: SchedulerState, opts?: { includeDisabled?: boolean }) {
  return await locked(state, async () => {
    await ensureLoadedForRead(state);
    const includeDisabled = opts?.includeDisabled === true;
    const jobs = (state.store?.jobs ?? []).filter((j) => includeDisabled || j.enabled);
    return [...jobs].sort((a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0));
  });
}

export async function add(state: SchedulerState, input: JobCreate) {
  return await locked(state, async () => {
    warnIfDisabled(state, "add");
    await ensureLoaded(state);
    const job = createJob(state, input);
    state.store?.jobs.push(job);
    recomputeNextRuns(state);
    await persist(state);
    armTimer(state);
    state.deps.log.info(
      { jobId: job.id, jobName: job.name, nextRunAtMs: job.state.nextRunAtMs },
      "scheduler: job added",
    );
    return job;
  });
}

export async function update(state: SchedulerState, id: string, patch: JobPatch) {
  return await locked(state, async () => {
    warnIfDisabled(state, "update");
    await ensureLoaded(state, { skipRecompute: true });
    const job = findJobOrThrow(state, id);
    const now = state.deps.nowMs();
    applyJobPatch(job, patch);
    if (job.schedule.kind === "every") {
      const anchor = job.schedule.anchorMs;
      if (typeof anchor !== "number" || !Number.isFinite(anchor)) {
        job.schedule = {
          ...job.schedule,
          anchorMs: Math.max(0, Math.floor(job.createdAtMs ?? now)),
        };
      }
    }
    const scheduleChanged = patch.schedule !== undefined;
    const enabledChanged = patch.enabled !== undefined;
    job.updatedAtMs = now;
    if (scheduleChanged || enabledChanged) {
      if (job.enabled) {
        job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
      } else {
        job.state.nextRunAtMs = undefined;
        job.state.runningAtMs = undefined;
      }
    } else if (job.enabled) {
      const nextRun = job.state.nextRunAtMs;
      if (typeof nextRun !== "number" || !Number.isFinite(nextRun)) {
        job.state.nextRunAtMs = computeJobNextRunAtMs(job, now);
      }
    }
    await persist(state);
    armTimer(state);
    return job;
  });
}

export async function remove(state: SchedulerState, id: string) {
  return await locked(state, async () => {
    warnIfDisabled(state, "remove");
    await ensureLoaded(state);
    const before = state.store?.jobs.length ?? 0;
    if (!state.store) return { ok: false as const, removed: false as const };
    state.store.jobs = state.store.jobs.filter((j) => j.id !== id);
    const removed = state.store.jobs.length !== before;
    await persist(state);
    armTimer(state);
    return { ok: true as const, removed };
  });
}

export async function run(state: SchedulerState, id: string, mode?: "due" | "force") {
  return await locked(state, async () => {
    warnIfDisabled(state, "run");
    await ensureLoaded(state, { skipRecompute: true });
    const job = findJobOrThrow(state, id);
    if (typeof job.state.runningAtMs === "number") {
      return { ok: true as const, ran: false as const, reason: "already-running" as const };
    }
    const now = state.deps.nowMs();
    const due = isJobDue(job, now, { forced: mode === "force" });
    if (!due) {
      return { ok: true as const, ran: false as const, reason: "not-due" as const };
    }
    await executeJob(state, job, now, { forced: mode === "force" });
    recomputeNextRuns(state);
    await persist(state);
    armTimer(state);
    return { ok: true as const, ran: true as const };
  });
}

/** Run due jobs now (e.g. when scheduler is accessed). Call fire-and-forget so follow-ups send even if timer didn't fire. */
export async function triggerTimerTick(state: SchedulerState) {
  await onTimer(state);
}
