import fs from "node:fs";
import path from "node:path";
import type { StoreFile } from "./types";

export async function loadStore(storePath: string): Promise<StoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const jobs = Array.isArray(record.jobs) ? record.jobs.filter(Boolean) : [];
    return { version: 1, jobs: jobs as StoreFile["jobs"] };
  } catch (err) {
    if ((err as { code?: string })?.code === "ENOENT") {
      return { version: 1, jobs: [] };
    }
    throw err;
  }
}

export async function saveStore(storePath: string, store: StoreFile) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, storePath);
}
