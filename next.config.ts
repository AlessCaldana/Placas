import type { NextConfig } from "next";

// Next buffers in memory the body of every request src/proxy.ts handles, before
// the proxy decides. The proxy only runs on the /admin pages, which never
// receive uploads, so 1 MB is plenty. Photo uploads go to /api/admin, which the
// proxy does not match: those handlers check the session first and then apply
// their own limits (src/lib/request-body.ts, src/lib/product-images.ts).
// Checked by tests/security-config.test.ts.
const PROXY_CLIENT_MAX_BODY_SIZE = "1mb";

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
