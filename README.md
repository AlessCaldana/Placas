# PLACA — Decorative Italiane

Web pública (catálogo) + panel privado de administración. Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma.

> Estado: Etapa 2 en curso: PostgreSQL de prueba conectado y guardado de productos activo. El panel `/admin` sigue **sin login** (temporal); aún no hay autenticación.

## Requisitos

- Node.js **20.19+** (probado con 22) y npm
- PostgreSQL accesible mediante pgAdmin 4 u otra herramienta

## Puesta en marcha

```bash
npm install            # instala dependencias y ejecuta `prisma generate`
cp .env.example .env   # rellena DATABASE_URL (y el resto cuando se pida)
npm run dev            # http://localhost:3000
```

Comprobación: abre `http://localhost:3000` y `http://localhost:3000/api/health`
(`database: "not_configured"` si no hay `DATABASE_URL`, `"ok"` si conecta, `"error"` si falla).

## Base de prueba PostgreSQL

La primera migración está en `prisma/migrations/20261005160000_init_test_catalog/migration.sql`. En pgAdmin 4, selecciona la base de prueba, abre **Tools → Query Tool**, carga ese archivo y ejecuta el script. Crea categorías, productos, traducciones IT/FR/ES/EN y los presets iniciales de medidas y precio.

Después configura `DATABASE_URL` en `.env` con la conexión a esa base, por ejemplo `postgresql://USUARIO:CONTRASENA@localhost:5432/placa_test?schema=public`. No compartas ni subas `.env`. Como el SQL se ejecuta manualmente, sincroniza el historial de Prisma una vez con:

```bash
npx prisma migrate resolve --applied 20261005160000_init_test_catalog
```

Reinicia `npm run dev`. `/api/health` debe responder `database: "ok"`; la ficha `/admin/prodotti/nuovo` ya permitirá guardar y `/admin/prodotti` leerá los productos de PostgreSQL. Si no hay `DATABASE_URL`, el panel conserva los datos de demostración y desactiva el guardado.

Las imágenes se guardan como archivos locales en `public/uploads/products/`; PostgreSQL conserva sus rutas en `product_images.url` y la primera imagen aparece junto al nombre en el listado. Se admiten hasta 8 archivos JPG, PNG o WebP de 5 MB cada uno. En pgAdmin, puedes consultar las imágenes así:

```sql
SELECT p."referenceCode", p.name, i.url, i.position
FROM products AS p
LEFT JOIN product_images AS i ON i."productId" = p.id
ORDER BY p."createdAt" DESC, i.position;
```

Esta carpeta local es adecuada para la prueba; antes de desplegar en producción, habrá que mover los archivos a almacenamiento persistente (por ejemplo, S3) y guardar su URL en la misma tabla.

## Panel de administración (temporal)

Abierto sin login en `http://localhost:3000/admin` mientras se desarrolla. En producción devuelve 404 salvo `ADMIN_PREVIEW=1`; **no lo actives en un servidor público**. El login real llega en la Etapa 2.

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
src/lib/          conexión db.ts, servicios y validadores
src/messages/     index.ts — textos de interfaz en italiano, francés, español e inglés
prisma/           schema.prisma y migraciones PostgreSQL
tests/            pruebas Vitest
docs/             decisiones y documentación
```

## Notas

- Los colores y la tipografía actuales son **provisionales**; se sustituirán por los de Figma Make.
- `.env` nunca se sube a Git. Usa `.env.example` como plantilla.
- El cliente de Prisma se genera en `src/generated/` (ignorado por Git).
- El idioma se conserva en una cookie `placa_locale`; la búsqueda cruzada usa alias de categorías para los datos de muestra. El catálogo real necesitará guardar traducciones y términos de búsqueda por registro.
- Las medidas y precios personalizados del formulario se guardan en `localStorage` de este navegador; los presets globales de `product_options` están en la base de prueba.
- La base creada por esta migración es solo de prueba. No la uses para datos oficiales ni de producción.
