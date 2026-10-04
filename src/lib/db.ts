import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida. Revisa tu archivo .env");
  }
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
