import * as ops from "./service/ops";
import { createState, type SchedulerDeps } from "./service/state";
import type { Job, JobCreate, JobPatch } from "./types";

export type { Job, JobCreate, JobPatch, RunResult, Schedule, Logger } from "./types";
export type { SchedulerDeps } from "./service/state";

export class Scheduler {
  private readonly state;

  constructor(deps: SchedulerDeps) {
    this.state = createState(deps);
  }

  async start() {
    await ops.start(this.state);
  }

  stop() {
    ops.stop(this.state);
  }

  async status() {
    return await ops.status(this.state);
  }

  async list(opts?: { includeDisabled?: boolean }) {
    return await ops.list(this.state, opts);
  }

  async add(input: JobCreate) {
    return await ops.add(this.state, input);
  }

  async update(id: string, patch: JobPatch) {
    return await ops.update(this.state, id, patch);
  }

  async remove(id: string) {
    return await ops.remove(this.state, id);
  }

  async run(id: string, mode?: "due" | "force") {
    return await ops.run(this.state, id, mode);
  }

  getJob(id: string): Job | undefined {
    return this.state.store?.jobs.find((j) => j.id === id);
  }

  /** Run due jobs now. Call when scheduler is accessed so follow-up emails send even if the timer didn't fire. */
  async triggerTimerTick() {
    await ops.triggerTimerTick(this.state);
  }
}
