"use client";

import { useEffect, useState } from "react";
import { FlaskConical, ServerCrash } from "lucide-react";

type State = "ok" | "unavailable" | "down" | null;

/** Site-wide banner: shows when the models are not loaded or the API is down. */
export function StatusBanner() {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setState("down");
        const h = await r.json();
        setState(h.mode === "live" ? "ok" : "unavailable");
      })
      .catch(() => alive && setState("down"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "unavailable") {
    return (
      <div role="status" className="no-print border-b border-amber-200 bg-amber-50 text-amber-900">
        <p className="container-page flex items-center justify-center gap-2 py-2 text-center text-sm font-medium">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          The screening models are not loaded right now, so applications cannot be scored. Please try again shortly.
        </p>
      </div>
    );
  }
  if (state === "down") {
    return (
      <div role="status" className="no-print border-b border-rose-200 bg-rose-50 text-rose-900">
        <p className="container-page flex items-center justify-center gap-2 py-2 text-center text-sm font-medium">
          <ServerCrash className="size-4 shrink-0" aria-hidden />
          Service temporarily unavailable. Applications cannot be processed right now. Please try again shortly.
        </p>
      </div>
    );
  }
  return null;
}
