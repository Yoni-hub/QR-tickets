import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const TOKEN_TTL_MS = 90 * 1000;

export function useTurnstile() {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const cachedTokenRef = useRef({ token: "", receivedAt: 0 });
  const inFlightRef = useRef({ promise: null, resolve: null, reject: null, mode: "", consumerCount: 0 });

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

    const render = () => {
      if (widgetIdRef.current != null || !containerRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: "invisible",
        callback: (token) => {
          const inFlight = inFlightRef.current;
          if (typeof inFlight.resolve === "function") {
            inFlight.resolve(token);
          }

          if (inFlight.mode === "prefetch" && Number(inFlight.consumerCount || 0) < 1) {
            cachedTokenRef.current = { token, receivedAt: Date.now() };
          }

          inFlightRef.current = { promise: null, resolve: null, reject: null, mode: "", consumerCount: 0 };
        },
        "error-callback": () => {
          const inFlight = inFlightRef.current;
          if (typeof inFlight.reject === "function") {
            inFlight.reject(new Error("CAPTCHA verification failed. Please try again."));
          }
          cachedTokenRef.current = { token: "", receivedAt: 0 };
          inFlightRef.current = { promise: null, resolve: null, reject: null, mode: "", consumerCount: 0 };
        },
        "expired-callback": () => {
          const inFlight = inFlightRef.current;
          if (typeof inFlight.reject === "function") {
            inFlight.reject(new Error("CAPTCHA expired. Please try again."));
          }
          cachedTokenRef.current = { token: "", receivedAt: 0 };
          inFlightRef.current = { promise: null, resolve: null, reject: null, mode: "", consumerCount: 0 };
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
      cachedTokenRef.current = { token: "", receivedAt: 0 };
      inFlightRef.current = { promise: null, resolve: null, reject: null, mode: "", consumerCount: 0 };
    };
  }, []);

  const requestToken = (mode) => {
    if (!SITE_KEY || !window.turnstile || widgetIdRef.current == null) {
      return Promise.resolve(""); // dev mode — no CAPTCHA configured
    }

    const inFlight = inFlightRef.current;
    if (inFlight.promise) {
      if (mode === "get" && inFlight.mode === "prefetch") {
        inFlightRef.current = { ...inFlight, consumerCount: Number(inFlight.consumerCount || 0) + 1 };
      }
      return inFlight.promise;
    }

    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    inFlightRef.current = {
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      mode,
      consumerCount: mode === "get" ? 1 : 0,
    };

    window.turnstile.reset(widgetIdRef.current);
    window.turnstile.execute(widgetIdRef.current);

    return promise;
  };

  const getToken = () => {
    const cached = cachedTokenRef.current;
    if (cached.token && Date.now() - cached.receivedAt < TOKEN_TTL_MS) {
      cachedTokenRef.current = { token: "", receivedAt: 0 };
      return Promise.resolve(cached.token);
    }

    return requestToken("get");
  };

  const prefetchToken = () => {
    const cached = cachedTokenRef.current;
    if (cached.token && Date.now() - cached.receivedAt < TOKEN_TTL_MS) return;

    requestToken("prefetch").catch(() => {});
  };

  return { containerRef, getToken, prefetchToken };
}
