"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/modal";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export type PwaInstallState = {
  /** El navegador está ofreciendo instalación (Chrome/Edge emiten `beforeinstallprompt`). */
  canInstall: boolean;
  /** La app ya se está ejecutando como aplicación instalada. */
  installed: boolean;
  /** Safari/iOS: no emite `beforeinstallprompt`; hay que guiar al usuario. */
  isIOS: boolean;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
let cached: PwaInstallState | null = null;
const listeners = new Set<() => void>();

const SERVER_STATE: PwaInstallState = { canInstall: false, installed: false, isIOS: false };

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function snapshot(): PwaInstallState {
  if (cached === null) {
    cached = {
      canInstall: deferredPrompt !== null,
      installed: installed || detectStandalone(),
      isIOS: detectIOS(),
    };
  }
  return cached;
}

function invalidate() {
  cached = null;
}

function emit() {
  invalidate();
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
  try {
    window.matchMedia("(display-mode: standalone)").addEventListener("change", emit);
  } catch {
    // Navegadores sin soporte de `display-mode`: la detección sigue funcionando.
  }
}

export function usePwaInstall(): PwaInstallState & {
  promptInstall: () => Promise<InstallOutcome>;
} {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_STATE);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    deferredPrompt = null;
    emit();
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        installed = true;
        emit();
        return "accepted";
      }
      return "dismissed";
    } catch {
      return "unavailable";
    }
  }, []);

  return { ...state, promptInstall };
}

export function InstallHelpModal({
  open,
  onClose,
  isIOS,
}: {
  open: boolean;
  onClose: () => void;
  isIOS: boolean;
}) {
  const steps = isIOS
    ? [
        "Abre GRANATE en Safari.",
        "Pulsa el botón Compartir (cuadrado con una flecha).",
        "Elige «Añadir a pantalla de inicio» y confirma con «Añadir».",
      ]
    : [
        "Abre GRANATE en Chrome (o tu navegador).",
        "Toca el menú ⋮ de la barra de navegación.",
        "Elige «Instalar aplicación» o «Añadir a pantalla de inicio».",
        "Confirma la instalación.",
      ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instalar GRANATE"
      subtitle={
        isIOS
          ? "En iPhone/iPad no hay botón automático: se añade desde Safari."
          : "Una vez instalada, GRANATE se abre en su propia ventana."
      }
    >
      <ol className="space-y-3 p-5 text-sm text-[var(--text-soft)]">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="border-t border-[var(--border)] px-5 py-4">
        <button type="button" className="btn w-full" onClick={onClose}>
          Entendido
        </button>
      </div>
    </Modal>
  );
}
