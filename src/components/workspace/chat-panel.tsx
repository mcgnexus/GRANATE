"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

type Citation = { index: number; noteId: string; path: string; name: string; heading: string | null };
type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export function ChatPanel({
  vaultId,
  onOpenNote,
}: {
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;

    const prompt = question.trim();
    setQuestion("");
    setError("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);

    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch(`/api/v1/vaults/${vaultId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          history: messages.slice(-6).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "El chat no está disponible.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const line = block.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type: string;
              text?: string;
              citations?: Citation[];
            };
            if (event.type === "citations" && event.citations) {
              setMessages((prev) =>
                prev.map((message, index) =>
                  index === assistantIndex ? { ...message, citations: event.citations } : message,
                ),
              );
            }
            if (event.type === "delta" && event.text) {
              setMessages((prev) =>
                prev.map((message, index) =>
                  index === assistantIndex
                    ? { ...message, content: message.content + event.text }
                    : message,
                ),
              );
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido");
      setMessages((prev) => prev.slice(0, assistantIndex));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Sparkles size={15} className="text-[var(--gold)]" />
        <div>
          <div className="text-sm font-medium">Pregunta a la bóveda</div>
          <div className="text-[10px] text-[var(--muted)]">RAG con citas a tus notas</div>
        </div>
      </div>

      <div className="scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-xs leading-6 text-[var(--muted)]">
            Pregunta lo que quieras sobre tus notas. Ejemplos:
            <ul className="mt-2 space-y-1">
              <li>«Resume lo que tengo sobre sensores de humedad»</li>
              <li>«¿Qué decisiones pendientes hay en TecRural?»</li>
              <li>«Busca contradicciones entre estas dos notas»</li>
            </ul>
            <p className="mt-3 text-[10px]">
              Las notas son datos no confiables: el modelo no ejecuta instrucciones que encuentre
              dentro de ellas.
            </p>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-[12.5px] leading-6 ${
                message.role === "user"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)]"
              }`}
            >
              {message.content || (loading ? "…" : "")}
            </div>
            {message.citations?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.citations.map((citation) => (
                  <button
                    key={`${citation.noteId}-${citation.heading ?? ""}`}
                    type="button"
                    onClick={() => onOpenNote(citation.path)}
                    className="chip hover:border-[var(--accent)]"
                    title={citation.path}
                  >
                    [{citation.index}] {citation.name}
                    {citation.heading ? ` · ${citation.heading}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-2)]">
          {error}
        </div>
      ) : null}

      <form onSubmit={send} className="flex items-end gap-2 border-t border-[var(--border)] p-3">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(event);
            }
          }}
          rows={2}
          placeholder="Pregunta sobre tus notas…"
          className="input min-h-[44px] resize-none text-xs"
        />
        <button type="submit" className="btn btn-primary h-10 w-10 p-0" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
