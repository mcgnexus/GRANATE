"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    let cancelled = false;
    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      try {
        if (sessionStorage.getItem("granate-sw-reloaded") === "1") return;
        sessionStorage.setItem("granate-sw-reloaded", "1");
      } catch {
        // Si sessionStorage falla, recargamos igualmente una vez por evento.
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const timer = window.setTimeout(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        await registration.update();
        if (!cancelled && registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
        }
      } catch {
        // Sin service worker la app sigue funcionando.
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
