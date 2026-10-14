import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientIp,
  createRateLimiter,
  createSlidingWindowLimiter,
  forwardedChainIsLoopback,
  isLoopbackIp,
} from "@/lib/rate-limit";
import { isReviewableOrder, parseReviewInput, toDisplayName } from "@/lib/services/reviews";
import { isCheckoutSessionId, isUuid, parseReviewStatusInput } from "@/lib/validators/review";

const sessionId = "cs_test_a1B2c3D4e5F6g7H8i9J0";

const valid = {
  sessionId,
  firstName: "Mario",
  lastName: "Rossi",
  rating: 5,
  comment: "Targa bellissima, spedizione veloce.",
};

describe("parseReviewInput", () => {
  it("accepts a valid review and ignores unknown fields", () => {
    expect(parseReviewInput({ ...valid, status: "APPROVED", orderId: "x", isAdmin: true })).toEqual(valid);
  });

  it("trims and collapses spaces in names", () => {
    const parsed = parseReviewInput({ ...valid, firstName: "  Gian   Luca ", lastName: " De  Rossi " });
    expect(parsed?.firstName).toBe("Gian Luca");
    expect(parsed?.lastName).toBe("De Rossi");
  });

  it("accepts accents, apostrophes and hyphens in names", () => {
    const parsed = parseReviewInput({ ...valid, firstName: "José-María", lastName: "D'Àmico" });
    expect(parsed?.firstName).toBe("José-María");
    expect(parsed?.lastName).toBe("D'Àmico");
    expect(parseReviewInput({ ...valid, lastName: "D’Angelo" })?.lastName).toBe("D’Angelo");
  });

  it("rejects invalid names", () => {
    expect(parseReviewInput({ ...valid, firstName: "" })).toBeNull();
    expect(parseReviewInput({ ...valid, firstName: "   " })).toBeNull();
    expect(parseReviewInput({ ...valid, firstName: "--" })).toBeNull();
    expect(parseReviewInput({ ...valid, firstName: "Mario1" })).toBeNull();
    expect(parseReviewInput({ ...valid, lastName: "<script>" })).toBeNull();
    expect(parseReviewInput({ ...valid, lastName: "a".repeat(61) })).toBeNull();
    expect(parseReviewInput({ ...valid, lastName: "a".repeat(60) })?.lastName).toHaveLength(60);
    expect(parseReviewInput({ ...valid, firstName: 42 })).toBeNull();
  });

  it("accepts only integer ratings from 1 to 5", () => {
    expect(parseReviewInput({ ...valid, rating: 1 })?.rating).toBe(1);
    for (const rating of [0, 6, 4.5, "5", null, Number.NaN]) {
      expect(parseReviewInput({ ...valid, rating })).toBeNull();
    }
  });

  it("enforces comment length after trimming", () => {
    expect(parseReviewInput({ ...valid, comment: "   corto    " })).toBeNull();
    expect(parseReviewInput({ ...valid, comment: "1234567890" })?.comment).toBe("1234567890");
    expect(parseReviewInput({ ...valid, comment: "x".repeat(1000) })?.comment).toHaveLength(1000);
    expect(parseReviewInput({ ...valid, comment: "x".repeat(1001) })).toBeNull();
    expect(parseReviewInput({ ...valid, comment: ["array"] })).toBeNull();
  });

  it("removes control characters and limits consecutive line breaks", () => {
    const parsed = parseReviewInput({
      ...valid,
      comment: "Ottimo\u0000 lavoro\u202E!\r\n\r\n\r\n\r\n\r\nGrazie   mille\t ancora",
    });
    expect(parsed?.comment).toBe("Ottimo lavoro!\n\n\nGrazie mille ancora");
  });

  it("removes invisible format characters but keeps emoji joiners", () => {
    const parsed = parseReviewInput({
      ...valid,
      comment: "\uFEFFOtti\u200Bmo\u00AD lavoro\u2066 bello\u2069\u200E\u200F\u2060\u{E0041} grazie",
    });
    expect(parsed?.comment).toBe("Ottimo lavoro bello grazie");
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(parseReviewInput({ ...valid, comment: `Bellissima ${family}` })?.comment).toBe(
      `Bellissima ${family}`,
    );
  });

  it("rejects invalid session ids and bodies", () => {
    expect(parseReviewInput({ ...valid, sessionId: "pi_123456789012" })).toBeNull();
    expect(parseReviewInput({ ...valid, sessionId: "cs_short" })).toBeNull();
    expect(parseReviewInput({ ...valid, sessionId: "cs_test_abc-def-ghi-jkl" })).toBeNull();
    expect(parseReviewInput({ ...valid, sessionId: undefined })).toBeNull();
    expect(parseReviewInput(null)).toBeNull();
    expect(parseReviewInput("review")).toBeNull();
    expect(parseReviewInput([valid])).toBeNull();
  });
});

describe("review helpers", () => {
  it("shows first name and surname initial only", () => {
    expect(toDisplayName("Mario", "Rossi")).toBe("Mario R.");
    expect(toDisplayName("Anna", "de Luca")).toBe("Anna D.");
    expect(toDisplayName("Élodie", "Ölmez")).toBe("Élodie Ö.");
    expect(toDisplayName("Luca", "'Ndrangheta")).toBe("Luca N.");
    expect(toDisplayName("Luca", "-")).toBe("Luca");
  });

  it("does not allow reviews for orders whose charged amount did not match", () => {
    expect(isReviewableOrder({ status: "PAID", reviewReason: null })).toBe(true);
    expect(isReviewableOrder({ status: "NEEDS_REVIEW", reviewReason: "stock:PL-1" })).toBe(true);
    expect(isReviewableOrder({ status: "NEEDS_REVIEW", reviewReason: "amount_mismatch" })).toBe(false);
    expect(isReviewableOrder({ status: "NEEDS_REVIEW", reviewReason: "stock:PL-1, amount_mismatch" })).toBe(
      false,
    );
    expect(isReviewableOrder({ status: "PENDING", reviewReason: null })).toBe(false);
  });

  it("validates session ids, ids and moderation status", () => {
    expect(isCheckoutSessionId(sessionId)).toBe(true);
    expect(isCheckoutSessionId(`cs_${"a".repeat(256)}`)).toBe(false);
    expect(isUuid("0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01")).toBe(true);
    expect(isUuid("../etc/passwd")).toBe(false);
    expect(parseReviewStatusInput({ status: "APPROVED" })).toBe("APPROVED");
    expect(parseReviewStatusInput({ status: "HIDDEN" })).toBe("HIDDEN");
    expect(parseReviewStatusInput({ status: "PENDING" })).toBeNull();
    expect(parseReviewStatusInput(null)).toBeNull();
  });
});

describe("createRateLimiter", () => {
  it("blocks after the limit and resets when the window ends", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
    const start = 2_000_000;
    for (let hit = 0; hit < 4; hit += 1) limiter.register("198.51.100.1", start);
    expect(limiter.retryAfterSeconds("198.51.100.1", start)).toBe(0);
    limiter.register("198.51.100.1", start);
    expect(limiter.retryAfterSeconds("198.51.100.1", start + 60_000)).toBe(14 * 60);
    expect(limiter.retryAfterSeconds("198.51.100.2", start)).toBe(0);
    expect(limiter.retryAfterSeconds("198.51.100.1", start + 15 * 60 * 1000)).toBe(0);
  });

  it("evicts the oldest key when the map is full", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 15 * 60 * 1000 });
    const start = 3_000_000;
    for (let index = 0; index < 10_000; index += 1) limiter.register(`key-${index}`, start);
    expect(limiter.retryAfterSeconds("key-0", start)).toBeGreaterThan(0);
    limiter.register("key-new", start);
    expect(limiter.retryAfterSeconds("key-new", start)).toBeGreaterThan(0);
    expect(limiter.retryAfterSeconds("key-0", start)).toBe(0);
    expect(limiter.retryAfterSeconds("key-1", start)).toBeGreaterThan(0);
  });
});

describe("createSlidingWindowLimiter", () => {
  it("allows at most max hits in any window, without a burst at the window edge", () => {
    const limiter = createSlidingWindowLimiter({ max: 3, windowMs: 60_000 });
    const start = 5_000_000;
    limiter.register("k", start);
    limiter.register("k", start + 30_000);
    limiter.register("k", start + 50_000);
    // The oldest hit leaves the window at start + 60 s.
    expect(limiter.retryAfterSeconds("k", start + 55_000)).toBe(5);
    expect(limiter.retryAfterSeconds("k", start + 60_000)).toBe(0);
    limiter.register("k", start + 60_000);
    // Still three hits within the last minute: blocked until start + 90 s.
    expect(limiter.retryAfterSeconds("k", start + 61_000)).toBe(29);
  });

  it("undo releases the last reservation", () => {
    const limiter = createSlidingWindowLimiter({ max: 1, windowMs: 60_000 });
    limiter.register("k", 1_000);
    expect(limiter.retryAfterSeconds("k", 1_000)).toBe(60);
    limiter.undo("k", 1_000);
    expect(limiter.retryAfterSeconds("k", 1_000)).toBe(0);
  });
});

describe("clientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const request = (headers: Record<string, string>) =>
    new Request("http://localhost/api/reviews", { headers });

  it("without TRUSTED_PROXY_HOPS trusts no header at all (spoofed X-Forwarded-For is ignored)", () => {
    for (const hops of ["", "0", "abc"]) {
      vi.stubEnv("TRUSTED_PROXY_HOPS", hops);
      expect(clientIp(request({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBeNull();
      expect(clientIp(request({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
      expect(clientIp(request({ "x-real-ip": "203.0.113.5" }))).toBeNull();
      expect(clientIp(request({}))).toBeNull();
    }
  });

  it("warns once in production when no proxy is trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clientIp(request({}));
    clientIp(request({}));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("with N trusted proxies uses the N-th value from the right and ignores X-Real-IP", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const headers = { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2", "x-real-ip": "7.7.7.7" };
    expect(clientIp(request(headers))).toBe("203.0.113.9");
    // A chain shorter than the configured proxies did not pass through all of them.
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    // nginx with `proxy_set_header X-Forwarded-For $remote_addr;` sends a single value.
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    // With $proxy_add_x_forwarded_for the client part on the left is ignored.
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("accepts only IP addresses and unwraps IPv4-mapped IPv6", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(clientIp(request({ "x-forwarded-for": "::ffff:203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(request({ "x-forwarded-for": "2001:DB8::1" }))).toBe("2001:db8::1");
    expect(clientIp(request({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    expect(clientIp(request({ "x-forwarded-for": "a".repeat(5000) }))).toBeNull();
  });
});

describe("loopback helpers", () => {
  it("recognizes loopback addresses only", () => {
    expect(isLoopbackIp("127.0.0.1")).toBe(true);
    expect(isLoopbackIp("127.1.2.3")).toBe(true);
    expect(isLoopbackIp("::1")).toBe(true);
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackIp("192.168.1.20")).toBe(false);
    expect(isLoopbackIp("localhost")).toBe(false);
    expect(isLoopbackIp(null)).toBe(false);
  });

  it("requires every X-Forwarded-For entry to be loopback", () => {
    const headers = (value?: string) => new Headers(value ? { "x-forwarded-for": value } : {});
    expect(forwardedChainIsLoopback(headers())).toBe(true);
    expect(forwardedChainIsLoopback(headers("::1"))).toBe(true);
    expect(forwardedChainIsLoopback(headers("127.0.0.1, ::1"))).toBe(true);
    expect(forwardedChainIsLoopback(headers("192.168.1.20"))).toBe(false);
    expect(forwardedChainIsLoopback(headers("127.0.0.1, 192.168.1.20"))).toBe(false);
  });
});
