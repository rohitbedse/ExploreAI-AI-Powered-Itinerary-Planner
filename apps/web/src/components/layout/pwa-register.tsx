"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only (dev HMR and SW caches don't mix). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is a progressive enhancement */
    });
  }, []);
  return null;
}
