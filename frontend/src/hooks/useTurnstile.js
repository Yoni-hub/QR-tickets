import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export function useTurnstile() {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const resolveRef = useRef(null);
  const rejectRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

    const render = () => {
      if (widgetIdRef.current != null || !containerRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: "invisible",
        callback: (token) => {
          if (resolveRef.current) resolveRef.current(token);
          resolveRef.current = null;
          rejectRef.current = null;
        },
        "error-callback": () => {
          if (rejectRef.current) rejectRef.current(new Error("CAPTCHA verification failed. Please try again."));
          resolveRef.current = null;
          rejectRef.current = null;
        },
        "expired-callback": () => {
          if (rejectRef.current) rejectRef.current(new Error("CAPTCHA expired. Please try again."));
          resolveRef.current = null;
          rejectRef.current = null;
        },
      });
    };

    if (window.turnstile) {
      render();
    } else {
      window.onloadTurnstileCallback = render;
    }

    return () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const getToken = () => {
    return new Promise((resolve, reject) => {
      if (!SITE_KEY || !window.turnstile || widgetIdRef.current == null) {
        resolve(""); // dev mode — no CAPTCHA configured
        return;
      }
      resolveRef.current = resolve;
      rejectRef.current = reject;
      window.turnstile.reset(widgetIdRef.current);
      window.turnstile.execute(widgetIdRef.current);
    });
  };

  return { containerRef, getToken };
}
