# Arquitectura (Etapa 2, en construcción)

## Decisiones

- **Next.js + TypeScript**: web pública, panel y API en un único proyecto; SSR para SEO del catálogo.
- **PostgreSQL + Prisma 7** (generador `prisma-client` + adaptador `pg`): migraciones y consultas parametrizadas.
- **Tailwind CSS 4**: estilos. Sin librería de componentes todavía (se decidirá al integrar el diseño de Figma).
- **Idiomas de la interfaz**: italiano, francés, español e inglés (`src/messages/index.ts`). La primera visita solicita una preferencia y la conserva en la cookie `placa_locale`.
- **Búsqueda multilingüe**: un diccionario compartido de alias conecta categorías demo entre idiomas, tanto en web pública como en administración. Al conectar el catálogo persistente, cada categoría/producto deberá guardar nombres traducidos y términos de búsqueda propios.
- **Sin Google Fonts** por ahora: tipografía del sistema hasta recibir la de Figma.

## Pendiente de decidir

- Hosting y base de datos gestionada (antes de la Etapa 10).
- Ventas y autenticación administrativa siguen pendientes.

## Seguridad (base)

- Credenciales solo en variables de entorno; `.env` fuera de Git.
- `/api/health` no expone detalles de errores.

## Etapa 2 — Persistencia inicial de prueba

- `prisma/schema.prisma` define categorías jerárquicas, productos con código de referencia único, traducciones IT/FR/ES/EN, presets e imágenes de producto.
- La migración `prisma/migrations/20261005160000_init_test_catalog/migration.sql` crea el esquema PostgreSQL y los presets iniciales. Es solo para la base de prueba; se ejecuta en pgAdmin 4 y luego se sincroniza con `prisma migrate resolve`.
- `POST /api/admin/products` guarda producto, categoría y referencias de imagen en una transacción; `GET /api/admin/products` alimenta la lista. Requieren `DATABASE_URL`; sin conexión, la interfaz conserva el modo demostrativo.
- Los archivos de prueba se escriben en `public/uploads/products/`; PostgreSQL solo guarda sus rutas en `product_images`. Antes de producción, se debe usar almacenamiento persistente externo.
- Los nombres y términos multilingües están modelados, pero el formulario todavía guarda el nombre base; la edición de traducciones queda para una etapa posterior.

## Etapa 1b — Identidad visual

- Tokens y CSS base portados del diseño de Figma Make (`src/app/globals.css`); sin dependencia de CDN.
- Fuentes autoalojadas con `@fontsource` (DM Sans Variable e Instrument Serif), adecuado para la UE.
- Layout público en `src/app/(public)/` con `PublicHeader`, `Footer` y la home maquetada.
- Contenido de la home DEMOSTRATIVO (`src/lib/demo-data.ts`); el número de WhatsApp es un placeholder (`src/lib/site.ts`).
- Decisiones de alcance: sin personalización ni textos de envío/IVA; la venta se cierra por WhatsApp; categorías en árbol único; solo estado disponible/no disponible en la web pública.

## Etapa 3 (adelantada) — Zona de administración sin login

- Rutas en `src/app/admin/`: `dashboard`, `prodotti`, `prodotti/nuovo` (diseño completo) y `categorie`, `vendite`, `statistiche`, `richieste`, `impostazioni` (marcadas "In arrivo").
- **Sin autenticación (TEMPORAL).** `src/app/admin/layout.tsx` devuelve 404 en producción salvo `ADMIN_PREVIEW=1`. Se elimina en la Etapa 2, cuando haya login y protección de rutas.
- Dashboard y ventas siguen usando datos demostrativos (`src/lib/demo-data.ts`). La creación/lista de productos usa PostgreSQL cuando se configura la base de prueba; el resto de formularios continúa siendo demostrativo.
- `noindex` en todo el panel.
