# PLACA — Decorative Italiane

Web pública (catálogo) + panel privado de administración. Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma.

> Estado: **Etapa 1 — preparación del proyecto**. Aún no hay catálogo, panel, tablas ni login (Etapas 2 a 10).

## Requisitos

- Node.js **20.19+** (probado con 22) y npm
- PostgreSQL accesible (local, Neon, Supabase…) — necesario desde la Etapa 2

## Puesta en marcha

```bash
npm install            # instala dependencias y ejecuta `prisma generate`
cp .env.example .env   # rellena DATABASE_URL (y el resto cuando se pida)
npm run dev            # http://localhost:3000
```

Comprobación: abre `http://localhost:3000` y `http://localhost:3000/api/health`
(`database: "not_configured"` si no hay `DATABASE_URL`, `"ok"` si conecta, `"error"` si falla).

## Scripts

| Script                            | Qué hace                                   |
| --------------------------------- | ------------------------------------------ |
| `npm run dev` / `build` / `start` | Desarrollo, build y servidor de producción |
| `npm run typecheck`               | Comprueba tipos (TypeScript)               |
| `npm run lint`                    | ESLint                                     |
| `npm run format` / `format:check` | Prettier                                   |
| `npm test`                        | Vitest (pruebas unitarias)                 |
| `npm run db:generate`             | Genera el cliente de Prisma                |
| `npm run db:migrate`              | Crea/aplica migraciones en desarrollo      |
| `npm run db:migrate:deploy`       | Aplica migraciones en producción           |

## Estructura

```
src/app/          rutas (web pública y, más adelante, /admin) y API
src/components/   ui/, public/, admin/
src/lib/          db.ts, y más adelante auth, services, validators
src/messages/     it.ts — textos de la interfaz en italiano
prisma/           schema.prisma y migraciones (modelos: Etapa 2)
tests/            pruebas Vitest
docs/             decisiones y documentación
```

## Notas

- Los colores y la tipografía actuales son **provisionales**; se sustituirán por los de Figma Make.
- `.env` nunca se sube a Git. Usa `.env.example` como plantilla.
- El cliente de Prisma se genera en `src/generated/` (ignorado por Git).
