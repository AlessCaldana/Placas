import type { NextConfig } from "next";

// Must equal maxProductImageRequestSize in src/lib/product-images.ts (8 photos
// of 5 MB + 1 MB of form fields = 41 MiB; checked by tests/security-config.test.ts).
// src/proxy.ts runs on /admin and /api/admin, and Next buffers the body of every
// request it handles up to this size; with the default (10 MB) larger photo
// uploads were silently truncated. Route handlers enforce their own, smaller
// limits (src/lib/request-body.ts). In production also cap the body size in the
// reverse proxy (nginx: `client_max_body_size 42m;`).
const PROXY_CLIENT_MAX_BODY_SIZE = 41 * 1024 * 1024;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HTTPS only in production: in development the site runs on http://localhost.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El indicador de desarrollo ("N") tapaba el enlace del pie del menú lateral.
  devIndicators: { position: "bottom-right" },
  experimental: {
    proxyClientMaxBodySize: PROXY_CLIENT_MAX_BODY_SIZE,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
