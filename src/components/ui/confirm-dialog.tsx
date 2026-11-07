"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "./modal";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
};

export type PromptOptions = {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
};

type DialogState =
  | { mode: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { mode: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

/** Reemplaza window.prompt/window.confirm con un dialogo accesible de la app. */
export function useDialogs() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [value, setValue] = useState("");
  const dialogRef = useRef<DialogState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      dialogRef.current = { mode: "confirm", options, resolve };
      setDialog(dialogRef.current);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      dialogRef.current = { mode: "prompt", options, resolve };
      setValue(options.initialValue ?? "");
      setDialog(dialogRef.current);
    });
  }, []);

  const close = useCallback((result: boolean | string | null) => {
    const current = dialogRef.current;
    if (!current) return;
    dialogRef.current = null;
    if (current.mode === "confirm") current.resolve(result === true);
    else current.resolve(typeof result === "string" ? result : null);
    setDialog(null);
  }, []);

  const dialogNode = dialog ? (
    <Modal open onClose={() => close(null)} title={dialog.options.title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          close(dialog.mode === "confirm" ? true : value);
        }}
        className="space-y-3 p-5"
      >
        {dialog.options.message ? (
          <p className="text-xs leading-5 text-[var(--muted)]">{dialog.options.message}</p>
        ) : null}
        {dialog.mode === "prompt" ? (
          <input
            className="input"
            value={value}
            placeholder={dialog.options.placeholder}
            onChange={(event) => setValue(event.target.value)}
            aria-label={dialog.options.title}
            autoFocus
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => close(null)} className="btn btn-ghost h-8 text-xs">
            Cancelar
          </button>
          <button
            type="submit"
            className={`btn h-8 text-xs ${
              dialog.mode === "confirm" && dialog.options.danger
                ? "bg-[var(--accent-2)] text-white"
                : "btn-primary"
            }`}
          >
            {dialog.mode === "confirm" ? dialog.options.confirmLabel ?? "Confirmar" : "Aceptar"}
          </button>
        </div>
      </form>
    </Modal>
  ) : null;

  return { confirm, prompt, dialogNode };
}
