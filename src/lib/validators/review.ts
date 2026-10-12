export type ReviewInput = {
  sessionId: string;
  firstName: string;
  lastName: string;
  rating: number;
  comment: string;
};

export type ReviewModerationStatus = "APPROVED" | "HIDDEN";

const SESSION_ID = /^cs_[A-Za-z0-9_]{10,255}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Letters in any script (accents included), spaces, apostrophes and hyphens.
const PERSON_NAME = /^[\p{L} '’-]+$/u;
const HAS_LETTER = /\p{L}/u;
const NAME_MAX = 60;
const COMMENT_MIN = 10;
const COMMENT_MAX = 1000;
// Control characters except line feed, plus invisible format characters
// (\p{Cf}: bidirectional overrides, zero-width spaces, BOM...) that could
// disguise the text shown in the admin panel. U+200D (zero-width joiner) is
// kept because composed emojis need it.
const UNSAFE_COMMENT_CHARS = /(?!\u200D)[\u0000-\u0009\u000B-\u001F\u007F-\u009F\p{Cf}]/gu;

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function parsePersonName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > NAME_MAX) return null;
  return PERSON_NAME.test(name) && HAS_LETTER.test(name) ? name : null;
}

function parseComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const comment = value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_COMMENT_CHARS, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return comment.length >= COMMENT_MIN && comment.length <= COMMENT_MAX ? comment : null;
}

/** Validates a buyer review submission. Unknown fields are ignored. */
export function parseReviewInput(value: unknown): ReviewInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isCheckoutSessionId(input.sessionId)) return null;
  const firstName = parsePersonName(input.firstName);
  const lastName = parsePersonName(input.lastName);
  const rating = input.rating;
  const comment = parseComment(input.comment);
  if (!firstName || !lastName || !comment) return null;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return { sessionId: input.sessionId, firstName, lastName, rating, comment };
}

/** Validates the admin moderation body `{ status: "APPROVED" | "HIDDEN" }`. */
export function parseReviewStatusInput(value: unknown): ReviewModerationStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  return status === "APPROVED" || status === "HIDDEN" ? status : null;
}
