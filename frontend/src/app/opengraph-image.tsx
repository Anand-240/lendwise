import { ImageResponse } from "next/og";

export const alt = "LendWise — Instant AI-powered loan decisions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1C1917 0%, #292524 60%, #44403C 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#ffffff" fillOpacity="0.1" />
            <path d="M9 8v16h9" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M16 17l3.2 3.2L25 12" stroke="#D4A43A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700 }}>LendWise</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>Instant AI-powered loan decisions</div>
          <div style={{ fontSize: 30, color: "#E6C878" }}>Apply in minutes · Decision in seconds · 100% digital</div>
        </div>
        <div style={{ fontSize: 22, color: "#A8A29E" }}>ML-powered demo platform · not an actual credit offer</div>
      </div>
    ),
    size,
  );
}
