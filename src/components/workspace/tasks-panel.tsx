"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Task = { noteId: string; path: string; text: string; done: boolean; line: number };

function TasksPanelInner({
  onClose,
  vaultId,
  onOpenNote,
}: {
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<"all" | "todo" | "done">("todo");
  const [error, setError] = useState(false);

  const loadTasks = useCallback(() => {
    setError(false);
    setTasks(null);
    fetch(`/api/v1/vaults/${vaultId}/tasks`)
      .then(async (r) => {
        if (!r.ok) throw new Error("tasks");
        const data = (await r.json()) as { tasks?: Task[] };
        return data.tasks ?? [];
      })
      .then((result) => setTasks(result))
      .catch(() => setError(true));
  }, [vaultId]);

  useEffect(() => {
    const timer = window.setTimeout(loadTasks, 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);

  const visible = (tasks ?? []).filter((task) =>
    filter === "all" ? true : filter === "todo" ? !task.done : task.done,
  );

  return (
    <Modal open onClose={onClose} title="Tareas de la bóveda" subtitle="Checkboxes de todas las notas">
      <div className="p-4">
        <div className="mb-3 flex gap-1">
          {(["todo", "done", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`btn h-7 px-2 text-[10px] ${filter === value ? "bg-[var(--accent-soft)]" : "btn-ghost"}`}
            >
              {value === "todo" ? "Pendientes" : value === "done" ? "Hechas" : "Todas"}
            </button>
          ))}
        </div>
        {error ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-[var(--muted)]">No se pudieron cargar las tareas.</p>
            <button type="button" onClick={loadTasks} className="btn btn-ghost mx-auto mt-2 h-7 px-3 text-xs">
              Reintentar
            </button>
          </div>
        ) : tasks === null ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Sin tareas.</p>
        ) : (
          <div className="space-y-1">
            {visible.map((task, index) => (
              <button
                key={`${task.noteId}-${task.line}-${index}`}
                type="button"
                onClick={() => {
                  onOpenNote(task.path);
                  onClose();
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
              >
                {task.done ? (
                  <CheckSquare size={13} className="mt-0.5 shrink-0 text-[var(--green)]" />
                ) : (
                  <Square size={13} className="mt-0.5 shrink-0 text-[var(--muted)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--text-soft)]"}`}>
                    {task.text || "(vacía)"}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                    {task.path} · línea {task.line}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function TasksPanel({
  open,
  onClose,
  vaultId,
  onOpenNote,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  if (!open) return null;
  return <TasksPanelInner onClose={onClose} vaultId={vaultId} onOpenNote={onOpenNote} />;
}
