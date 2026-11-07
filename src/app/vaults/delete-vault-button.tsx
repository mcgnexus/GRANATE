"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { deleteVaultAction } from "./actions";

export function DeleteVaultButton({ vaultId, vaultName }: { vaultId: string; vaultName: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const match = confirm === vaultName;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirm("");
          setOpen(true);
        }}
        className="btn h-8 w-8 p-0 text-[var(--muted)] hover:text-[var(--accent-2)]"
        title="Borrar bóveda"
        aria-label={`Borrar bóveda ${vaultName}`}
      >
        <Trash2 size={13} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Borrar bóveda"
        subtitle="Pasará a la papelera y se eliminará definitivamente tras 30 días."
      >
        <form
          action={(formData) => {
            setOpen(false);
            void deleteVaultAction(formData);
          }}
          className="space-y-3 p-5"
        >
          <input type="hidden" name="vaultId" value={vaultId} />
          <p className="text-xs leading-5 text-[var(--muted)]">
            Se perderán el acceso de los miembros, los enlaces compartidos y, al purgarse, todas
            las notas y adjuntos. Escribe{" "}
            <span className="font-semibold text-[var(--text)]">{vaultName}</span> para confirmar.
          </p>
          <input
            name="confirmName"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="input"
            placeholder={vaultName}
            autoComplete="off"
            aria-label="Confirmar nombre de la bóveda"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-8 text-xs">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!match}
              className="btn h-8 bg-[var(--accent-2)] text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
