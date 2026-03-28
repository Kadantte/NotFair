import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";

export const alt = `${SITE_NAME} social preview`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "#1A1917",
          color: "#E8E4DD",
          padding: "56px",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#4CAF6E",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            AdsAgent
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 72,
              lineHeight: 1,
              fontWeight: 700,
              maxWidth: 880,
            }}
          >
            <span>Connect Google Ads</span>
            <span style={{ color: "#4CAF6E" }}>to AI workflows</span>
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 880,
              fontSize: 28,
              lineHeight: 1.35,
              color: "#B3ADA2",
            }}
          >
            AI Google Ads agent, Google Ads MCP, optimization guidance, and
            impact tracking.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "20px",
            fontSize: 24,
            color: "#B3ADA2",
          }}
        >
          <span>Claude</span>
          <span>OpenClaw</span>
          <span>MCP-compatible workflows</span>
        </div>
      </div>
    ),
    size,
  );
}
