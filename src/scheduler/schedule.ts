import { Cron } from "croner";
import { parseAbsoluteTimeMs } from "./parse";
import type { Schedule } from "./types";

function resolveCronTimezone(tz?: string) {
  const trimmed = typeof tz === "string" ? tz.trim() : "";
  if (trimmed) {
    return trimmed;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** If "at" is in the past, return this many ms from now so the job runs immediately. */
const AT_PAST_RUN_DELAY_MS = 500;

export function computeNextRunAtMs(schedule: Schedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    const sched = schedule as { at?: string; atMs?: number | string };
    const atMs =
      typeof sched.atMs === "number" && Number.isFinite(sched.atMs) && sched.atMs > 0
        ? sched.atMs
        : typeof sched.atMs === "string"
          ? parseAbsoluteTimeMs(sched.atMs)
          : typeof sched.at === "string"
            ? parseAbsoluteTimeMs(sched.at)
            : null;
    if (atMs === null) {
      return undefined;
    }
    // If run time is in the past, schedule for immediate run (next tick) so the job still fires
    if (atMs <= nowMs) {
      return nowMs + AT_PAST_RUN_DELAY_MS;
    }
    return atMs;
  }

  if (schedule.kind === "every") {
    const everyMs = Math.max(1, Math.floor(schedule.everyMs));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
    if (nowMs < anchor) {
      return anchor;
    }
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    return anchor + steps * everyMs;
  }

  const expr = schedule.expr.trim();
  if (!expr) {
    return undefined;
  }
  const cron = new Cron(expr, {
    timezone: resolveCronTimezone(schedule.tz),
    catch: false,
  });
  const next = cron.nextRun(new Date(nowMs));
  if (!next) {
    return undefined;
  }
  const nextMs = next.getTime();
  if (!Number.isFinite(nextMs)) {
    return undefined;
  }
  if (nextMs > nowMs) {
    return nextMs;
  }

  const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
  const retry = cron.nextRun(new Date(nextSecondMs));
  if (!retry) {
    return undefined;
  }
  const retryMs = retry.getTime();
  return Number.isFinite(retryMs) && retryMs > nowMs ? retryMs : undefined;
}
