"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function VaultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GRANATE] Error en la bóveda", error);
  }, [error]);

  return (
    <main className="bg-grain flex min-h-dvh items-center justify-center p-6">
      <div className="panel max-w-md p-8 text-center">
        <h1 className="font-display text-2xl">Algo se ha roto al cargar la bóveda</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Puede deberse a una versión antigua en caché tras un despliegue. Recarga la página; si
          persiste, borra los datos del sitio para este dominio.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-5">
          <RefreshCw size={15} /> Recargar
        </button>
      </div>
    </main>
  );
}
