import type { Job, RunStatus } from "../types";
import {
  collectRunnableJobs,
  computeJobNextRunAtMs,
  nextWakeAtMs,
  recomputeNextRunsForMaintenance,
} from "./jobs";
import { locked } from "./locked";
import type { SchedulerState } from "./state";
import { ensureLoaded, persist } from "./store";

const MAX_TIMER_DELAY_MS = 60_000;
const MIN_REFIRE_GAP_MS = 2_000;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;

const ERROR_BACKOFF_SCHEDULE_MS = [
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];

function errorBackoffMs(consecutiveErrors: number): number {
  const idx = Math.min(consecutiveErrors - 1, ERROR_BACKOFF_SCHEDULE_MS.length - 1);
  return ERROR_BACKOFF_SCHEDULE_MS[Math.max(0, idx)];
}

function applyJobResult(
  state: SchedulerState,
  job: Job,
  result: { status: RunStatus; error?: string; startedAt: number; endedAt: number },
): boolean {
  job.state.runningAtMs = undefined;
  job.state.lastRunAtMs = result.startedAt;
  job.state.lastStatus = result.status;
  job.state.lastDurationMs = Math.max(0, result.endedAt - result.startedAt);
  job.state.lastError = result.error;
  job.updatedAtMs = result.endedAt;

  if (result.status === "error") {
    job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
  } else {
    job.state.consecutiveErrors = 0;
  }

  const shouldDelete =
    job.schedule.kind === "at" && job.deleteAfterRun === true && result.status === "ok";

  if (!shouldDelete) {
    if (job.schedule.kind === "at") {
      job.enabled = false;
      job.state.nextRunAtMs = undefined;
    } else if (result.status === "error" && job.enabled) {
      const backoff = errorBackoffMs(job.state.consecutiveErrors ?? 1);
      const normalNext = computeJobNextRunAtMs(job, result.endedAt);
      const backoffNext = result.endedAt + backoff;
      job.state.nextRunAtMs =
        normalNext !== undefined ? Math.max(normalNext, backoffNext) : backoffNext;
    } else if (job.enabled) {
      const naturalNext = computeJobNextRunAtMs(job, result.endedAt);
      if (job.schedule.kind === "cron") {
        const minNext = result.endedAt + MIN_REFIRE_GAP_MS;
        job.state.nextRunAtMs =
          naturalNext !== undefined ? Math.max(naturalNext, minNext) : minNext;
      } else {
        job.state.nextRunAtMs = naturalNext;
      }
    } else {
      job.state.nextRunAtMs = undefined;
    }
  }

  return shouldDelete;
}

export function armTimer(state: SchedulerState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
  if (!state.deps.enabled) {
    state.deps.log.debug({}, "scheduler: armTimer skipped - disabled");
    return;
  }
  const nextAt = nextWakeAtMs(state);
  if (!nextAt) {
    state.deps.log.debug(
      { jobCount: state.store?.jobs.length ?? 0 },
      "scheduler: armTimer skipped - no jobs with nextRunAtMs",
    );
    return;
  }
  const now = state.deps.nowMs();
  const delay = Math.max(nextAt - now, 0);
  const clampedDelay = Math.min(delay, MAX_TIMER_DELAY_MS);
  state.timer = setTimeout(() => {
    void onTimer(state).catch((err) => {
      state.deps.log.error({ err: String(err) }, "scheduler: timer tick failed");
    });
  }, clampedDelay);
  state.deps.log.debug(
    { nextAt, delayMs: clampedDelay, clamped: delay > MAX_TIMER_DELAY_MS },
    "scheduler: timer armed",
  );
}

export async function onTimer(state: SchedulerState) {
  if (state.running) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      void onTimer(state).catch((err) => {
        state.deps.log.error({ err: String(err) }, "scheduler: timer tick failed");
      });
    }, MAX_TIMER_DELAY_MS);
    return;
  }
  state.running = true;
  try {
    const dueJobs = await locked(state, async () => {
      await ensureLoaded(state, { forceReload: true, skipRecompute: true });
      const due = collectRunnableJobs(state, state.deps.nowMs());

      if (due.length === 0) {
        const changed = recomputeNextRunsForMaintenance(state);
        if (changed) await persist(state);
        return [];
      }

      const now = state.deps.nowMs();
      for (const job of due) {
        job.state.runningAtMs = now;
        job.state.lastError = undefined;
      }
      await persist(state);

      return due.map((j) => ({ id: j.id, job: j }));
    });

    const results: Array<{
      jobId: string;
      status: RunStatus;
      error?: string;
      startedAt: number;
      endedAt: number;
    }> = [];

    for (const { id, job } of dueJobs) {
      const startedAt = state.deps.nowMs();
      job.state.runningAtMs = startedAt;

      let result: { status: RunStatus; error?: string };
      try {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        result = await Promise.race([
          state.deps.executeJob(job).then((r) => {
            if (timeoutId) clearTimeout(timeoutId);
            return r;
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("scheduler: job execution timed out")),
              DEFAULT_JOB_TIMEOUT_MS,
            );
          }),
        ]);
        if (!result || typeof result !== "object" || !("status" in result)) {
          result = { status: "error", error: "executeJob did not return RunResult" };
        }
      } catch (err) {
        state.deps.log.warn(
          { jobId: id, jobName: job.name },
          `scheduler: job failed: ${String(err)}`,
        );
        result = { status: "error", error: String(err) };
      }
      results.push({
        jobId: id,
        status: result.status,
        error: result.error,
        startedAt,
        endedAt: state.deps.nowMs(),
      });
    }

    if (results.length > 0) {
      await locked(state, async () => {
        await ensureLoaded(state, { forceReload: true, skipRecompute: true });

        for (const result of results) {
          const job = state.store?.jobs.find((j) => j.id === result.jobId);
          if (!job) continue;

          const shouldDelete = applyJobResult(state, job, {
            status: result.status,
            error: result.error,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
          });

          if (shouldDelete && state.store) {
            state.store.jobs = state.store.jobs.filter((j) => j.id !== job.id);
          }
        }

        recomputeNextRunsForMaintenance(state);
        await persist(state);
      });
    }
  } finally {
    state.running = false;
    armTimer(state);
  }
}

export async function executeJob(
  state: SchedulerState,
  job: Job,
  _nowMs: number,
  _opts: { forced: boolean },
) {
  if (!job.state) job.state = {};
  const startedAt = state.deps.nowMs();
  job.state.runningAtMs = startedAt;
  job.state.lastError = undefined;

  let result: { status: RunStatus; error?: string };
  try {
    result = await state.deps.executeJob(job);
  } catch (err) {
    result = { status: "error", error: String(err) };
  }

  const endedAt = state.deps.nowMs();
  const shouldDelete = applyJobResult(state, job, {
    status: result.status,
    error: result.error,
    startedAt,
    endedAt,
  });

  if (shouldDelete && state.store) {
    state.store.jobs = state.store.jobs.filter((j) => j.id !== job.id);
  }
}

export async function runMissedJobs(
  state: SchedulerState,
  opts?: { skipJobIds?: ReadonlySet<string> },
) {
  if (!state.store) return;
  const now = state.deps.nowMs();
  const missed = collectRunnableJobs(state, now, {
    skipJobIds: opts?.skipJobIds,
    skipAtIfAlreadyRan: true,
  });
  if (missed.length > 0) {
    state.deps.log.info(
      { count: missed.length, jobIds: missed.map((j) => j.id) },
      "scheduler: running missed jobs after restart",
    );
    for (const job of missed) {
      await executeJob(state, job, now, { forced: false });
    }
  }
}

export function stopTimer(state: SchedulerState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
}
