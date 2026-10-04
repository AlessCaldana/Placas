# Arquitectura (Etapa 1)

## Decisiones

- **Next.js + TypeScript**: web pública, panel y API en un único proyecto; SSR para SEO del catálogo.
- **PostgreSQL + Prisma 7** (generador `prisma-client` + adaptador `pg`): migraciones y consultas parametrizadas.
- **Tailwind CSS 4**: estilos. Sin librería de componentes todavía (se decidirá al integrar el diseño de Figma).
- **Idioma de la interfaz**: italiano (`src/messages/it.ts`). Multilenguaje pendiente de decisión del cliente.
- **Sin Google Fonts** por ahora: tipografía del sistema hasta recibir la de Figma.

## Pendiente de decidir

- Hosting y base de datos gestionada (antes de la Etapa 10).
- Idiomas de la web pública.
- Variantes de producto (medidas) y ventas de una o varias líneas (antes de la Etapa 2).

## Seguridad (base)

- Credenciales solo en variables de entorno; `.env` fuera de Git.
- `/api/health` no expone detalles de errores.
