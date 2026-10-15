import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // `prisma generate` no necesita conexión real; migrate sí (fallará con error claro de conexión).
    url:
      process.env.DATABASE_URL ??
      "mysql://placeholder:placeholder@localhost:3306/placeholder",
  },
});
