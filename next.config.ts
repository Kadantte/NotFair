import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
