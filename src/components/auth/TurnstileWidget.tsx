"use client";

import { useEffect, useRef } from "react";
import { getBrowserTurnstileSiteKey } from "@/lib/config/supabaseEnv";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "myheroes-turnstile-script";

export function TurnstileWidget({ onTokenChange }: { onTokenChange: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = getBrowserTurnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => onTokenChange(token),
        "expired-callback": () => onTokenChange(""),
        "error-callback": () => onTokenChange(""),
      });
    };

    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existing?.removeEventListener("load", render);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [onTokenChange, siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex min-h-[65px] justify-center" />;
}
