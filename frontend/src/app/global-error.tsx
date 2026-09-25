"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, color: "#1C1917" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>LendWise is temporarily unavailable</h1>
          <p style={{ color: "#57534E" }}>Please refresh the page or try again in a few minutes.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, border: 0, background: "#1C1917", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
