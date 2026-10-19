export type MaintenanceInput = { enabled: boolean; message: string };

/** Matches the VARCHAR size of site_settings.maintenanceMessage. */
export const MAINTENANCE_MESSAGE_MAX = 300;

// Raw input larger than this is rejected before any normalisation work.
const RAW_MAX = 2048;
// Control (Cc), format (Cf: bidi overrides, zero-width…), lone surrogate (Cs),
// private-use (Co) and unassigned (Cn) code points.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;

/**
 * Validates the maintenance body `{ enabled: boolean, message?: string }`.
 * The message is a single line: trimmed, any whitespace run (tabs, line
 * breaks, non-breaking spaces…) becomes one space; absent or blank gives "".
 * Unknown fields are ignored. Returns null when invalid.
 */
export function parseMaintenanceInput(body: unknown): MaintenanceInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.enabled !== "boolean") return null;
  const raw = input.message;
  if (raw === undefined) return { enabled: input.enabled, message: "" };
  if (typeof raw !== "string" || raw.length > RAW_MAX || !raw.isWellFormed()) return null;
  const message = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (message.length > MAINTENANCE_MESSAGE_MAX || FORBIDDEN_CHARACTERS.test(message)) return null;
  return { enabled: input.enabled, message };
}
