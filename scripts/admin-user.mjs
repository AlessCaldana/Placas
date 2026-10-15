#!/usr/bin/env node
// Crea una cuenta del panel o restablece su contraseña desde la Terminal.
//
//   npm run admin:user
//
// La contraseña se escribe con el eco desactivado: no aparece en pantalla, ni
// en el historial de la shell, ni en argumentos o variables de entorno. Usa el
// mismo formato de hash y la misma política que la app (src/lib/password-core.mjs).
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import dotenv from "dotenv";
import mariadb from "mariadb";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  isValidEmail,
  normalizeEmail,
} from "../src/lib/password-core.mjs";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const POLICY_MESSAGES = {
  too_short: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  too_long: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`,
  same_as_email: "La contraseña no puede ser igual al email.",
};

class Cancelled extends Error {}
/** A rule that prevents the change; the message is shown to the owner. */
class Refused extends Error {}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Visible question. */
function ask(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let answered = false;
    rl.on("SIGINT", () => {
      rl.close();
      reject(new Cancelled());
    });
    rl.on("close", () => {
      if (!answered) reject(new Cancelled());
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Hidden question: raw mode, nothing is echoed. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      // Ignore escape sequences (arrows, function keys).
      if (chunk.startsWith("\u001b")) return;
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          reject(new Cancelled());
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (char < " ") continue;
        value += char;
      }
    };
    stdout.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function isYes(answer) {
  return /^(s|si|sí|y|yes)$/i.test(answer);
}

async function askEmail() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const email = normalizeEmail(await ask("Email: "));
    if (isValidEmail(email)) return email;
    console.log("Email no válido.");
  }
  throw new Cancelled();
}

async function askName() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const name = (await ask("Nombre visible en el panel: ")).replace(/\s+/g, " ");
    if (name && [...name].length <= 120 && !/[\u0000-\u001F\u007F-\u009F\p{Cf}]/u.test(name)) return name;
    console.log("Nombre no válido (1-120 caracteres).");
  }
  throw new Cancelled();
}

async function askRole(current) {
  const hint = current ? ` [Intro = mantener ${current.toLowerCase()}]` : "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = (await ask(`Rol (superadmin/admin)${hint}: `)).toLowerCase();
    if (!answer && current) return current;
    if (answer === "superadmin") return "SUPERADMIN";
    if (answer === "admin") return "ADMIN";
    console.log("Escribe superadmin o admin.");
  }
  throw new Cancelled();
}

async function askPassword(email) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const password = await askHidden("Contraseña (no se muestra): ");
    const reason = checkPasswordPolicy(password, email);
    if (reason) {
      console.log(POLICY_MESSAGES[reason]);
      continue;
    }
    const repeated = await askHidden("Repite la contraseña: ");
    if (repeated !== password) {
      console.log("Las contraseñas no coinciden.");
      continue;
    }
    return password;
  }
  throw new Cancelled();
}

/**
 * Runs work inside a SERIALIZABLE transaction, so the last-superadmin check
 * and the write cannot interleave with a concurrent change (panel or another
 * terminal). Retries deadlocks (MySQL/MariaDB error 1213) up to 3 times.
 */
async function serializable(client, work) {
  for (let attempt = 1; ; attempt += 1) {
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("START TRANSACTION");
    try {
      const result = await work();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (attempt < 3 && error && error.errno === 1213) continue;
      throw error;
    }
  }
}

async function activeSuperadminsExcept(client, id) {
  const rows = await client.query(
    "SELECT COUNT(*) AS total FROM admin_users WHERE role = 'SUPERADMIN' AND active = 1 AND id <> ?",
    [id ?? "00000000-0000-0000-0000-000000000000"],
  );
  return Number(rows[0].total);
}

/** The app keeps mysql:// in DATABASE_URL (Prisma); the mariadb driver wants mariadb://. */
function driverUrl(databaseUrl) {
  return databaseUrl.replace(/^mysql:/, "mariadb:");
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("Este comando debe ejecutarse en una Terminal interactiva (no con tuberías ni redirecciones).");
  }
  if (!process.env.DATABASE_URL) fail("DATABASE_URL no está definida. Revisa tu archivo .env");

  let client;
  try {
    client = await mariadb.createConnection(driverUrl(process.env.DATABASE_URL));
  } catch {
    fail("No se pudo conectar a la base de datos. Revisa DATABASE_URL y que MySQL/MariaDB esté en marcha.");
  }

  try {
    const table = await client.query(
      "SELECT COUNT(*) AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'admin_users'",
    );
    if (Number(table[0].present) === 0) {
      fail("Falta la tabla admin_users: aplica antes las migraciones (npm run db:migrate:deploy).");
    }

    console.log("Cuentas del panel PLACA: crear una cuenta o restablecer su contraseña.\n");
    const email = await askEmail();
    const existing = (
      await client.query("SELECT id, name, role, active FROM admin_users WHERE email = ?", [email])
    )[0];

    if (existing) {
      const state = existing.active ? "activa" : "desactivada";
      console.log(`Ya existe la cuenta "${existing.name}" (${existing.role.toLowerCase()}, ${state}).`);
      if (!isYes(await ask("¿Restablecer su contraseña? [s/N]: "))) {
        console.log("Sin cambios.");
        return;
      }
      const role = isYes(await ask("¿Cambiar también el rol? [s/N]: "))
        ? await askRole(existing.role)
        : existing.role;
      const reactivate = !existing.active && isYes(await ask("La cuenta está desactivada. ¿Reactivarla? [s/N]: "));
      const lastSuperadminMessage = "No se puede: debe quedar al menos un superadmin activo.";
      // Early check for a friendly answer; repeated inside the transaction below.
      const willBeActiveSuperadmin = (existing.active || reactivate) && role === "SUPERADMIN";
      if (!willBeActiveSuperadmin && (await activeSuperadminsExcept(client, existing.id)) === 0) {
        fail(lastSuperadminMessage);
      }
      const password = await askPassword(email);
      const passwordHash = await hashPassword(password);
      await serializable(client, async () => {
        const current = (
          await client.query("SELECT active FROM admin_users WHERE id = ? FOR UPDATE", [existing.id])
        )[0];
        if (!current) throw new Refused("La cuenta ya no existe. Sin cambios.");
        const staysActiveSuperadmin = (current.active || reactivate) && role === "SUPERADMIN";
        if (!staysActiveSuperadmin && (await activeSuperadminsExcept(client, existing.id)) === 0) {
          throw new Refused(lastSuperadminMessage);
        }
        await client.query(
          `UPDATE admin_users
              SET passwordHash = ?, role = ?, active = active OR ?,
                  sessionVersion = sessionVersion + 1, updatedAt = UTC_TIMESTAMP(3)
            WHERE id = ?`,
          [passwordHash, role, reactivate, existing.id],
        );
      });
      console.log(`Contraseña restablecida para ${email}. Sus sesiones abiertas se han cerrado.`);
      return;
    }

    console.log("No existe ninguna cuenta con ese email: se creará una nueva.");
    const name = await askName();
    const role = await askRole(null);
    const firstSuperadminMessage =
      "La primera cuenta debe ser superadmin (debe existir al menos un superadmin activo).";
    if (role !== "SUPERADMIN" && (await activeSuperadminsExcept(client, null)) === 0) {
      fail(firstSuperadminMessage);
    }
    const password = await askPassword(email);
    const passwordHash = await hashPassword(password);
    try {
      await serializable(client, async () => {
        if (role !== "SUPERADMIN" && (await activeSuperadminsExcept(client, null)) === 0) {
          throw new Refused(firstSuperadminMessage);
        }
        await client.query(
          `INSERT INTO admin_users (id, email, name, role, passwordHash, active, sessionVersion, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 1, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
          [randomUUID(), email, name, role, passwordHash],
        );
      });
    } catch (error) {
      if (error && error.errno === 1062) throw new Refused("Ese email ya está en uso. Sin cambios.");
      throw error;
    }
    console.log(`Cuenta creada: ${email} (${role.toLowerCase()}).`);
  } catch (error) {
    if (error instanceof Refused) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    if (error instanceof Cancelled) {
      console.log("\nCancelado. Sin cambios.");
      process.exitCode = 1;
      return;
    }
    // Only the error code: never print query parameters (they include the hash).
    const code = error && typeof error === "object" && "code" in error ? ` (código ${error.code})` : "";
    console.error(`Error inesperado al guardar la cuenta${code}.`);
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}

await main();
