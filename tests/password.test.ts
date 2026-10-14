import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_INPUT_MAX_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyAgainstDummyHash,
  verifyPassword,
} from "@/lib/password";
import * as core from "@/lib/password-core.mjs";

describe("password hashing", () => {
  it("hashes with a random salt and verifies", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    expect(await verifyPassword("correct horse battery staple", first)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", first)).toBe(false);
  });

  it("writes the self-describing scrypt$N$r$p$salt$hash format", async () => {
    const stored = await hashPassword("a-password-for-format");
    const [scheme, n, r, p, salt, key] = stored.split("$");
    expect([scheme, n, r, p]).toEqual(["scrypt", "32768", "8", "1"]);
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(key, "base64")).toHaveLength(64);
    // Independent recomputation: anything producing this format (the CLI
    // included) is verifiable by the app and vice versa.
    const expected = scryptSync("a-password-for-format", Buffer.from(salt, "base64"), 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    expect(expected.toString("base64")).toBe(key);
  });

  it("verifies older hashes (N = 2^14) and flags them for re-hashing", async () => {
    const salt = Buffer.from("0123456789abcdef");
    const key = scryptSync("handmade-password", salt, 64, { N: 16384, r: 8, p: 1 });
    const stored = `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
    expect(await verifyPassword("handmade-password", stored)).toBe(true);
    expect(needsRehash(stored)).toBe(true);
    expect(needsRehash(await hashPassword("handmade-password"))).toBe(false);
    expect(needsRehash("garbage")).toBe(false);
  });

  it("refuses input longer than the hard limit instead of truncating it", async () => {
    const stored = await hashPassword("x".repeat(PASSWORD_INPUT_MAX_LENGTH));
    expect(await verifyPassword("x".repeat(PASSWORD_INPUT_MAX_LENGTH), stored)).toBe(true);
    expect(await verifyPassword("x".repeat(PASSWORD_INPUT_MAX_LENGTH + 1), stored)).toBe(false);
    await expect(hashPassword("x".repeat(PASSWORD_INPUT_MAX_LENGTH + 1))).rejects.toThrow(RangeError);
  });

  it("uses the same implementation as the CLI module", () => {
    // scripts/admin-user.mjs imports src/lib/password-core.mjs directly.
    expect(hashPassword).toBe(core.hashPassword);
    expect(verifyPassword).toBe(core.verifyPassword);
  });

  it("returns false for malformed or abusive stored hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$10$abc")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$!!$!!")).toBe(false);
    // N too large (would allocate gigabytes) and N not a power of two.
    expect(await verifyPassword("x", "scrypt$4194304$8$1$MDEyMzQ1Njc4OWFiY2RlZg==$MDEyMzQ1Njc4OWFiY2RlZg==")).toBe(false);
    expect(await verifyPassword("x", "scrypt$10000$8$1$MDEyMzQ1Njc4OWFiY2RlZg==$MDEyMzQ1Njc4OWFiY2RlZg==")).toBe(false);
  });

  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummyHash("placa-dummy-password-for-timing")).toBe(false);
  });
});

describe("password policy", () => {
  it("requires 12 to 200 characters", () => {
    expect(checkPasswordPolicy("short-pass1")).toBe("too_short");
    expect(checkPasswordPolicy("twelve-chars")).toBeNull();
    expect(checkPasswordPolicy("a".repeat(200))).toBeNull();
    expect(checkPasswordPolicy("a".repeat(201))).toBe("too_long");
  });

  it("counts characters, not bytes", () => {
    expect(checkPasswordPolicy("àèìòùàèìòùà")).toBe("too_short");
    expect(checkPasswordPolicy("àèìòùàèìòùàè")).toBeNull();
  });

  it("rejects the account email as password", () => {
    expect(checkPasswordPolicy("Maria.Rossi@Example.com", " maria.rossi@example.com ")).toBe("same_as_email");
    expect(checkPasswordPolicy("maria.rossi@example.com!", "maria.rossi@example.com")).toBeNull();
  });
});
