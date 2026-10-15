#!/usr/bin/env node
// Copia una sola vez los datos reales de la tienda desde la base PostgreSQL
// antigua a la nueva base MySQL/MariaDB (ya migrada con `npm run db:migrate:deploy`).
//
//   COPY_SOURCE_URL="postgresql://..." COPY_TARGET_URL="mysql://..." npm run db:copy-from-postgres
//
// Las dos variables también pueden ir en .env. Con --dry-run solo cuenta filas.
//
// Copia: categorías, traducciones, productos, fotos (las filas; los archivos se
// copian aparte), opciones, ajustes de la tienda y cuentas del panel.
// NO copia pedidos, artículos de pedidos ni opiniones.
//
// La base de origen se lee dentro de una transacción READ ONLY: el script no
// puede modificarla. En el destino todo va en una única transacción; si algo
// falla no queda nada a medias.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mariadb from "mariadb";
import pg from "pg";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

// Parents before children (foreign keys). Orders and reviews are left out on purpose.
const TABLES = [
  "categories",
  "category_translations",
  "products",
  "product_translations",
  "product_images",
  "product_options",
  "site_settings",
  "admin_users",
];
// The migration seeds these with default presets; they are replaced by the real ones.
const REPLACED_TABLES = new Set(["product_options"]);

const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** MySQL DATETIME(3) in UTC, the way Prisma stores it. */
function toMysqlDate(date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function toMysqlValue(value) {
  if (value instanceof Date) return toMysqlDate(value);
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

/** Categories reference their parent: insert every parent before its children. */
function parentsFirst(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const done = new Set();
  const ordered = [];
  const visit = (row, depth = 0) => {
    if (done.has(row.id)) return;
    if (depth > rows.length) throw new Error("Las categorías tienen un ciclo de padres.");
    const parent = row.parentId ? byId.get(row.parentId) : null;
    if (parent) visit(parent, depth + 1);
    done.add(row.id);
    ordered.push(row);
  };
  rows.forEach((row) => visit(row));
  return ordered;
}

async function targetColumns(target, table) {
  const rows = await target.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows.map((row) => row.name);
}

async function main() {
  const sourceUrl = process.env.COPY_SOURCE_URL;
  const targetUrl = process.env.COPY_TARGET_URL;
  if (!sourceUrl || !targetUrl) fail("Faltan COPY_SOURCE_URL (PostgreSQL) y/o COPY_TARGET_URL (MySQL).");
  if (!/^postgres(ql)?:/.test(sourceUrl)) fail("COPY_SOURCE_URL debe ser una URL postgresql://");
  if (!/^(mysql|mariadb):/.test(targetUrl)) fail("COPY_TARGET_URL debe ser una URL mysql://");

  const source = new pg.Client({ connectionString: sourceUrl });
  let target;
  try {
    await source.connect();
  } catch {
    fail("No se pudo conectar a PostgreSQL (COPY_SOURCE_URL).");
  }
  try {
    target = await mariadb.createConnection(targetUrl.replace(/^mysql:/, "mariadb:"));
  } catch {
    await source.end().catch(() => {});
    fail("No se pudo conectar a MySQL/MariaDB (COPY_TARGET_URL).");
  }

  const sourceName = (await source.query("SELECT current_database() AS name")).rows[0].name;
  const targetName = (await target.query("SELECT DATABASE() AS name"))[0].name;
  console.log(`Origen (solo lectura): PostgreSQL "${sourceName}"`);
  console.log(`Destino: MySQL/MariaDB "${targetName}"${dryRun ? " (prueba, sin escribir)" : ""}\n`);

  try {
    await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

    // Read everything first, from one consistent snapshot.
    const data = new Map();
    for (const table of TABLES) {
      const columns = await targetColumns(target, table);
      if (columns.length === 0) {
        throw new Error(`Falta la tabla ${table} en el destino: aplica antes las migraciones.`);
      }
      const list = columns.map((column) => `"${column}"`).join(", ");
      let { rows } = await source.query(`SELECT ${list} FROM "${table}"`);
      if (table === "categories") rows = parentsFirst(rows);
      data.set(table, { columns, rows });
    }

    // The destination must be empty, so nothing real is ever overwritten.
    for (const table of TABLES) {
      if (REPLACED_TABLES.has(table)) continue;
      const count = Number((await target.query(`SELECT COUNT(*) AS total FROM \`${table}\``))[0].total);
      if (count > 0) throw new Error(`La tabla ${table} del destino ya tiene datos (${count} filas). No se copia nada.`);
    }

    for (const table of TABLES) console.log(`${table.padEnd(22)} ${data.get(table).rows.length} filas`);

    if (!dryRun) {
      await target.beginTransaction();
      try {
        for (const table of TABLES) {
          const { columns, rows } = data.get(table);
          if (REPLACED_TABLES.has(table)) await target.query(`DELETE FROM \`${table}\``);
          if (rows.length === 0) continue;
          const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")})
                       VALUES (${columns.map(() => "?").join(", ")})`;
          await target.batch(
            sql,
            rows.map((row) => columns.map((column) => toMysqlValue(row[column]))),
          );
        }
        await target.commit();
      } catch (error) {
        await target.rollback().catch(() => {});
        throw error;
      }

      // Check that every table arrived complete.
      for (const table of TABLES) {
        const expected = data.get(table).rows.length;
        const copied = Number((await target.query(`SELECT COUNT(*) AS total FROM \`${table}\``))[0].total);
        if (copied !== expected) throw new Error(`${table}: se esperaban ${expected} filas y hay ${copied}.`);
      }
      console.log("\nCopia completada y comprobada.");
    }
    await source.query("ROLLBACK");

    // The image files are not in the database: they must be copied to UPLOAD_DIR by hand.
    const urls = [
      ...data.get("product_images").rows.map((row) => row.url),
      ...data.get("site_settings").rows.map((row) => row.logoUrl).filter(Boolean),
    ];
    const local = join(fileURLToPath(new URL("..", import.meta.url)), "public");
    const missing = urls.filter((url) => url.startsWith("/uploads/") && !existsSync(join(local, url)));
    console.log(`\nFotos referenciadas: ${urls.length}. Copia la carpeta public/uploads a UPLOAD_DIR del servidor.`);
    if (missing.length > 0) {
      console.log(`Atención: ${missing.length} no están en public/uploads de este ordenador, por ejemplo ${missing[0]}`);
    }
  } catch (error) {
    await source.query("ROLLBACK").catch(() => {});
    // Only the message: never print row values (they include password hashes).
    const code = error && typeof error === "object" && "code" in error ? ` (código ${error.code})` : "";
    console.error(`\nError: ${error instanceof Error ? error.message.split("\n")[0] : "desconocido"}${code}`);
    console.error("No se ha copiado nada.");
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

await main();
