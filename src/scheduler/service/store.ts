import fs from "node:fs";
import { loadStore, saveStore } from "../store";
import type { Job } from "../types";
import { recomputeNextRuns } from "./jobs";
import type { SchedulerState } from "./state";

async function getFileMtimeMs(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.mtimeMs;
  } catch {
    return null;
  }
}

export async function ensureLoaded(
  state: SchedulerState,
  opts?: { forceReload?: boolean; skipRecompute?: boolean },
) {
  if (state.store && !opts?.forceReload) {
    return;
  }
  const fileMtimeMs = await getFileMtimeMs(state.deps.storePath);
  const loaded = await loadStore(state.deps.storePath);
  const jobs = (loaded.jobs ?? []) as Job[];
  for (const job of jobs) {
    if (!job.state || typeof job.state !== "object") {
      job.state = {};
    }
  }
  state.store = { version: 1, jobs };
  state.storeLoadedAtMs = state.deps.nowMs();
  state.storeFileMtimeMs = fileMtimeMs;

  if (!opts?.skipRecompute) {
    recomputeNextRuns(state);
  }
}

export function warnIfDisabled(state: SchedulerState, action: string) {
  if (state.deps.enabled) return;
  if (state.warnedDisabled) return;
  state.warnedDisabled = true;
  state.deps.log.warn(
    { enabled: false, action, storePath: state.deps.storePath },
    "scheduler: disabled; jobs will not run automatically",
  );
}

export async function persist(state: SchedulerState) {
  if (!state.store) return;
  await saveStore(state.deps.storePath, state.store);
  state.storeFileMtimeMs = await getFileMtimeMs(state.deps.storePath);
}
