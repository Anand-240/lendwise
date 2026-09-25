"use client";

import { useEffect, useState } from "react";
import { FlaskConical, ServerCrash } from "lucide-react";

type State = "ok" | "demo" | "down" | null;

/** Site-wide banner: shows when the ML model isn't loaded (demo mode) or the API is down. */
export function StatusBanner() {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setState("down");
        const h = await r.json();
        setState(h.mode === "demo" ? "demo" : "ok");
      })
      .catch(() => alive && setState("down"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "demo") {
    return (
      <div role="status" className="no-print border-b border-amber-200 bg-amber-50 text-amber-900">
        <p className="container-page flex items-center justify-center gap-2 py-2 text-center text-sm font-medium">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          Demo mode — ML model not loaded. Decisions are simulated and are not real model outputs.
        </p>
      </div>
    );
  }
  if (state === "down") {
    return (
      <div role="status" className="no-print border-b border-rose-200 bg-rose-50 text-rose-900">
        <p className="container-page flex items-center justify-center gap-2 py-2 text-center text-sm font-medium">
          <ServerCrash className="size-4 shrink-0" aria-hidden />
          Service temporarily unavailable. Applications can’t be processed right now. Please try again shortly.
        </p>
      </div>
    );
  }
  return null;
}
