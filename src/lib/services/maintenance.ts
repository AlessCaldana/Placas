import { cache } from "react";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { site } from "@/lib/site";
import { parseMaintenanceInput, type MaintenanceInput } from "@/lib/validators/maintenance";

export { parseMaintenanceInput };
export type { MaintenanceInput };

export type MaintenanceState = { enabled: boolean; message: string };

/** How long a read of the switch is reused by this process. */
export const MAINTENANCE_CACHE_TTL_MS = 5_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

const maintenanceSelect = { maintenanceMode: true, maintenanceMessage: true } as const;

// Per-process cache. `generation` changes on every save, so a read that started
// before the save cannot overwrite the newer state when it finishes.
let cached: { state: MaintenanceState; expiresAt: number } | null = null;
let pending: Promise<MaintenanceState> | null = null;
let generation = 0;
let lastErrorLogAt = Number.NEGATIVE_INFINITY;

function maintenanceOff(): MaintenanceState {
  return { enabled: false, message: "" };
}

function toState(row: { maintenanceMode: boolean; maintenanceMessage: string | null }): MaintenanceState {
  return { enabled: row.maintenanceMode, message: row.maintenanceMessage ?? "" };
}

function storeInCache(state: MaintenanceState): void {
  cached = { state, expiresAt: Date.now() + MAINTENANCE_CACHE_TTL_MS };
}

/** Clears the per-process cache and the error-log throttle (tests). */
export function clearMaintenanceCache(): void {
  cached = null;
  pending = null;
  generation += 1;
  lastErrorLogAt = Number.NEGATIVE_INFINITY;
}

// Only the error name/code, at most once a minute: no query details in the logs.
function logReadFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLogAt = now;
  const details = error && typeof error === "object" ? (error as { name?: unknown; code?: unknown }) : {};
  console.error("maintenance_state_unavailable", {
    name: typeof details.name === "string" ? details.name : "unknown",
    code: typeof details.code === "string" || typeof details.code === "number" ? details.code : undefined,
  });
}

async function fetchMaintenanceState(): Promise<MaintenanceState> {
  const startedAt = generation;
  try {
    const row = await getDb().siteSetting.findUnique({ where: { id: "default" }, select: maintenanceSelect });
    const state = row ? toState(row) : maintenanceOff();
    if (startedAt === generation) storeInCache(state);
    return state;
  } catch (error) {
    // Failures are not cached, so the next request tries again.
    logReadFailure(error);
    return maintenanceOff();
  }
}

/**
 * Reads the maintenance switch, reusing a read made in the last 5 seconds by
 * this process. Fails open: no database, no settings row or a database error
 * all mean "off", so an outage never closes the shop by itself.
 */
export async function readMaintenanceState(): Promise<MaintenanceState> {
  if (!isDatabaseConfigured()) return maintenanceOff();
  if (cached && cached.expiresAt > Date.now()) return { ...cached.state };
  pending ??= fetchMaintenanceState().finally(() => {
    pending = null;
  });
  return { ...(await pending) };
}

/** readMaintenanceState() memoized per request (Server Components, layouts). */
export const getMaintenanceState = cache(readMaintenanceState);

/** Saves the switch on the "default" settings row (created if missing) and refreshes the cache. */
export async function setMaintenanceState(input: MaintenanceInput): Promise<MaintenanceState> {
  const data = { maintenanceMode: input.enabled, maintenanceMessage: input.message || null };
  const saved = await getDb().siteSetting.upsert({
    where: { id: "default" },
    create: { id: "default", name: site.name, ...data },
    update: data,
    select: maintenanceSelect,
  });
  const state = toState(saved);
  generation += 1;
  pending = null;
  storeInCache(state);
  return { ...state };
}

/** True while maintenance mode is on (public APIs check it on every request). */
export async function isMaintenanceActive(): Promise<boolean> {
  return (await readMaintenanceState()).enabled;
}
