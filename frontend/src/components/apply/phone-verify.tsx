"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OtpSent } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  phone: string | undefined;
  verified: boolean;
  onVerified: (token: string) => void;
  error?: string;
};

const PHONE_RE = /^[6-9]\d{9}$/;

/** Sends and checks a one-time code for the mobile number. In demo mode (no SMS provider
 *  configured) the API returns the code and we show it on screen. */
export function PhoneVerify({ phone, verified, onVerified, error }: Props) {
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [sentFor, setSentFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validPhone = !!phone && PHONE_RE.test(phone);
  // A code sent for a different number no longer applies.
  const active = sent && sentFor === phone ? sent : null;

  async function send() {
    if (!validPhone) return;
    setBusy("send");
    setMessage(null);
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const retry = Number(res.headers.get("retry-after") || 0);
        if (retry) setCooldown(Math.min(retry, 3600));
        setMessage({ tone: "error", text: body?.error?.message ?? "Couldn’t send the code. Please try again." });
        return;
      }
      setSent(body);
      setSentFor(phone!);
      setCode("");
      setCooldown(body.resend_after);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setMessage({ tone: "error", text: "Service temporarily unavailable. Please try again shortly." });
    } finally {
      setBusy(null);
    }
  }

  async function verify(value = code) {
    if (!active || !/^\d{6}$/.test(value)) return;
    setBusy("verify");
    setMessage(null);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_id: active.verification_id, code: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: "error", text: body?.error?.message ?? "Couldn’t verify the code." });
        if (res.status === 410 || res.status === 429 || res.status === 409) setSent(null);
        return;
      }
      onVerified(body.token);
      setSent(null);
      setCode("");
    } catch {
      setMessage({ tone: "error", text: "Service temporarily unavailable. Please try again shortly." });
    } finally {
      setBusy(null);
    }
  }

  if (verified) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-800" role="status">
        <CheckCircle2 className="size-4" aria-hidden /> Mobile number verified
      </p>
    );
  }

  return (
    <div className={cn("space-y-3 rounded-md border p-4", error ? "border-danger/50 bg-rose-50/40" : "border-stone-200 bg-stone-50")}>
      {!active ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-stone-700">
            <ShieldCheck className="size-4 text-brand" aria-hidden />
            {validPhone ? "Verify this number with a one-time code." : "Enter your mobile number, then verify it with a one-time code."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={send} disabled={!validPhone || busy === "send" || cooldown > 0}>
            {busy === "send" && <Loader2 className="animate-spin" aria-hidden />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Enter the 6-digit code sent to <span className="font-medium">+91 {active.phone_masked}</span>. It expires in{" "}
            {Math.round(active.expires_in / 60)} minutes.
          </p>
          {active.demo_code && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note">
              <FlaskConical className="size-4 shrink-0" aria-hidden />
              <span>
                Demo mode — no SMS is sent. Your code is <strong className="font-mono tracking-widest">{active.demo_code}</strong>
              </span>
              <button
                type="button"
                className="ml-auto text-xs font-semibold underline underline-offset-2"
                onClick={() => {
                  setCode(active.demo_code!);
                  void verify(active.demo_code!);
                }}
              >
                Use this code
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="otp-code" className="sr-only">
              One-time code
            </label>
            <input
              ref={codeRef}
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void verify();
                }
              }}
              placeholder="••••••"
              className="h-11 w-36 rounded-lg border border-input bg-white px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
            <Button type="button" onClick={() => verify()} disabled={code.length !== 6 || busy === "verify"}>
              {busy === "verify" && <Loader2 className="animate-spin" aria-hidden />} Verify
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={send} disabled={busy === "send" || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p role="alert" className={cn("text-xs font-medium", message.tone === "error" ? "text-danger" : "text-stone-600")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
