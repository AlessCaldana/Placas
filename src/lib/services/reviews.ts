import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  isCheckoutSessionId,
  isUuid,
  parseReviewInput,
  type ReviewInput,
  type ReviewModerationStatus,
} from "@/lib/validators/review";

export { parseReviewInput };

export type PublicReview = {
  id: string;
  displayName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export type AdminReview = {
  id: string;
  firstName: string;
  lastName: string;
  rating: number;
  comment: string;
  status: "PENDING" | "APPROVED" | "HIDDEN";
  createdAt: string;
  customerEmail: string;
  /** Name given at checkout, to spot reviews signed with someone else's name. */
  customerName: string;
  productNames: string[];
};

export type ReviewEligibility = "can_review" | "already_reviewed" | "not_allowed";

// Only orders whose payment went through may leave a review.
const REVIEWABLE_ORDER_STATUSES = ["PAID", "NEEDS_REVIEW"] as const;
const DEFAULT_PUBLIC_LIMIT = 6;
const MAX_PUBLIC_LIMIT = 50;
const MAX_ADMIN_REVIEWS_PER_GROUP = 500;

const adminReviewSelect = {
  id: true,
  firstName: true,
  lastName: true,
  rating: true,
  comment: true,
  status: true,
  createdAt: true,
  order: {
    select: { customerEmail: true, customerName: true, items: { select: { name: true } } },
  },
} satisfies Prisma.ReviewSelect;

type AdminReviewRow = Prisma.ReviewGetPayload<{ select: typeof adminReviewSelect }>;

function toAdminReview(row: AdminReviewRow): AdminReview {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    customerEmail: row.order.customerEmail ?? "",
    customerName: row.order.customerName ?? "",
    productNames: row.order.items.map((item) => item.name),
  };
}

/** "Mario Rossi" -> "Mario R." so the public page never shows a full surname. */
export function toDisplayName(firstName: string, lastName: string): string {
  const initial = /\p{L}/u.exec(lastName)?.[0];
  return initial ? `${firstName.trim()} ${initial.toLocaleUpperCase()}.` : firstName.trim();
}

function isReviewableStatus(status: string): boolean {
  return (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

// Orders held for review because the charged amount differs from the order
// total are not confirmed purchases, so they cannot be reviewed.
export function isReviewableOrder(order: { status: string; reviewReason: string | null }): boolean {
  if (!isReviewableStatus(order.status)) return false;
  return !(order.status === "NEEDS_REVIEW" && order.reviewReason?.includes("amount_mismatch"));
}

async function findOrderForSession(sessionId: string) {
  return getDb().order.findUnique({
    where: { stripeSessionId: sessionId },
    select: { id: true, status: true, reviewReason: true, review: { select: { id: true } } },
  });
}

export async function getReviewEligibility(sessionId: string): Promise<ReviewEligibility> {
  if (!isCheckoutSessionId(sessionId)) return "not_allowed";
  const order = await findOrderForSession(sessionId);
  if (!order || !isReviewableOrder(order)) return "not_allowed";
  return order.review ? "already_reviewed" : "can_review";
}

/**
 * Stores a pending review for the paid order of the checkout session. Safe
 * against double submits: the unique orderId constraint decides the winner.
 */
export async function createReview(
  input: ReviewInput,
): Promise<"created" | "already_reviewed" | "not_allowed"> {
  if (!isCheckoutSessionId(input.sessionId)) return "not_allowed";
  const order = await findOrderForSession(input.sessionId);
  if (!order || !isReviewableOrder(order)) return "not_allowed";
  if (order.review) return "already_reviewed";

  try {
    await getDb().review.create({
      data: {
        orderId: order.id,
        firstName: input.firstName,
        lastName: input.lastName,
        rating: input.rating,
        comment: input.comment,
      },
    });
    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return "already_reviewed";
      // The order was deleted between the lookup and the insert.
      if (error.code === "P2003") return "not_allowed";
    }
    throw error;
  }
}

/** Approved reviews for the home page, newest first. */
export async function listPublishedReviews(limit = DEFAULT_PUBLIC_LIMIT): Promise<PublicReview[]> {
  const take = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_PUBLIC_LIMIT) : DEFAULT_PUBLIC_LIMIT;
  const rows = await getDb().review.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, firstName: true, lastName: true, rating: true, comment: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    displayName: toDisplayName(row.firstName, row.lastName),
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** All reviews for moderation: pending ones first, then the rest, newest first. */
export async function listAdminReviews(): Promise<AdminReview[]> {
  const db = getDb();
  const [pending, moderated] = await Promise.all([
    db.review.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: MAX_ADMIN_REVIEWS_PER_GROUP,
      select: adminReviewSelect,
    }),
    db.review.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: MAX_ADMIN_REVIEWS_PER_GROUP,
      select: adminReviewSelect,
    }),
  ]);
  return [...pending, ...moderated].map(toAdminReview);
}

/** Approves or hides a review. Returns null when it does not exist. */
export async function setReviewStatus(
  id: string,
  status: ReviewModerationStatus,
): Promise<AdminReview | null> {
  if (!isUuid(id)) return null;
  const db = getDb();
  const current = await db.review.findUnique({ where: { id }, select: { status: true } });
  if (!current) return null;
  // approvedAt keeps the first approval time while the review stays approved.
  const approvedAt =
    status === "HIDDEN" ? null : current.status === "APPROVED" ? undefined : new Date();
  try {
    const row = await db.review.update({
      where: { id },
      data: { status, approvedAt },
      select: adminReviewSelect,
    });
    return toAdminReview(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}

export async function deleteReview(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const deleted = await getDb().review.deleteMany({ where: { id } });
  return deleted.count > 0;
}
