import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

if (existsSync(prismaCli)) {
  const result = spawnSync(process.execPath, [prismaCli, "generate"], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
