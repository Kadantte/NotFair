import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  transpilePackages: ["outrank-next-js-blog"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.outrank.so" },
      { protocol: "https", hostname: "outrank.so" },
      { protocol: "https", hostname: "cdnimg.co" },
    ],
  },
  // quickjs-emscripten loads its WASM variant via dynamic import + package
  // self-reference (`@jitl/quickjs-wasmfile-release-asyncify/emscripten-module`).
  // Webpack mangles those into broken stubs at runtime — the failure surfaces
  // as a minified `TypeError: a is not a function` from runScript before any
  // user code runs. Externalize the family so Node resolves them natively.
  serverExternalPackages: [
    "quickjs-emscripten",
    "quickjs-emscripten-core",
    "@jitl/quickjs-ffi-types",
    "@jitl/quickjs-wasmfile-debug-asyncify",
    "@jitl/quickjs-wasmfile-debug-sync",
    "@jitl/quickjs-wasmfile-release-asyncify",
    "@jitl/quickjs-wasmfile-release-sync",
  ],
  async redirects() {
    return [
      {
        source: "/google-ads-claude-connector",
        destination: "/google-ads-claude-connector-setup-guide",
        permanent: true,
      },
      {
        source: "/google-ads-mcp-server",
        destination: "/google-ads-mcp",
        permanent: true,
      },
      // Legacy-host canonicalization to notfair.co.
      // OAuth/MCP paths are excluded because cross-origin redirects drop the
      // Authorization header (RFC 9110), which would break existing MCP
      // clients pinned to legacy hostnames. Those paths continue to serve
      // on the legacy host so the OAuth flow + bearer requests stay
      // single-origin — and the well-known metadata routes already reflect
      // the inbound Host, so audience stays consistent.
      // 301 over 308: GET-only HTML traffic; if any stray POST hits a
      // legacy marketing path, degrading to GET is the safer failure mode
      // than blindly replaying the body to a different host.
      {
        source: "/:path((?!api/mcp/|api/oauth/|\\.well-known/oauth-).*)",
        has: [{ type: "host", value: "adsagent.org" }],
        destination: "https://notfair.co/:path",
        statusCode: 301,
      },
      {
        source: "/:path((?!api/mcp/|api/oauth/|\\.well-known/oauth-).*)",
        has: [{ type: "host", value: "ads-agent-black.vercel.app" }],
        destination: "https://notfair.co/:path",
        statusCode: 301,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
