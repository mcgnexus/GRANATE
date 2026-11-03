"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type Mode = "login" | "register";

export function AuthForm({
  mode,
  notice,
  googleEnabled = false,
  registrationOpen = true,
}: {
  mode: Mode;
  notice?: string;
  googleEnabled?: boolean;
  registrationOpen?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { name, email, password } : { email, password },
        ),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "No se pudo completar la operación.");
        setLoading(false);
        return;
      }
      router.push("/vaults");
      router.refresh();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/" className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] font-bold text-white">
          G
        </Link>
        <div>
          <div className="font-display text-2xl leading-none">GRANATE</div>
          <div className="mt-1 text-xs text-[var(--muted)]">tu bóveda en la nube</div>
        </div>
      </div>

      <div className="panel p-6 sm:p-8">
        <h1 className="font-display text-3xl">
          {mode === "login" ? "Entrar en tu bóveda" : "Crear tu bóveda"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {mode === "login"
            ? "Tu conocimiento, desde cualquier dispositivo."
            : "Empieza con una bóveda vacía o importa la de Obsidian."}
        </p>

        {notice ? (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--green)]/40 bg-[var(--green)]/10 p-3 text-xs text-[var(--text-soft)]">
            <CheckCircle2 size={15} className="mt-0.5 text-[var(--green)]" />
            {notice}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" ? (
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">Nombre</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Manuel"
                required
                minLength={2}
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--muted)]">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--muted)]">Contraseña</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "register" ? "8+ caracteres, letra y número" : "tu contraseña"}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] p-3 text-xs text-[var(--accent-2)]">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full py-2.5" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {mode === "login" ? "Entrar" : "Crear cuenta"}
            {!loading ? <ArrowRight size={16} /> : null}
          </button>
        </form>

        {googleEnabled ? (
          <>
            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--border)]" />o
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <a href="/api/auth/google" className="btn w-full py-2.5">
              <GoogleMark /> Continuar con Google
            </a>
          </>
        ) : null}

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          {registrationOpen ? (
            mode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <Link href="/register" className="text-[var(--accent-2)] hover:underline">
                  Crear una
                </Link>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-[var(--accent-2)] hover:underline">
                  Entrar
                </Link>
              </>
            )
          ) : (
            <>
              Acceso restringido a la cuenta propietaria.{" "}
              <Link href="/login" className="text-[var(--accent-2)] hover:underline">
                Volver
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="mt-6 text-center text-[11px] leading-5 text-[var(--muted)]">
        Al continuar aceptas que tus notas se guarden en Neon y que las funciones de IA envían
        fragmentos de texto a OpenRouter y Google. Tus datos no se usan para entrenar modelos.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.3 3.8l-.1.1 3.4 2.6.2.2c2.1-1.9 3.3-4.8 3.3-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.6-2.8c-1 .7-2.3 1.2-4 1.2-3 0-5.6-2-6.5-4.8l-.1.1-3.6 2.8-.1.1C3.6 21.3 7.5 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.1-1.6.4-2.3l-.1-.1-3.6-2.8-.1.1C.6 9.2 0 10.5 0 12.5s.6 3.3 1.6 4.7l3.9-2.4Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c2.1 0 3.6.9 4.4 1.6l3.2-3.1C17.7 1.4 15.1 0 12 0 7.5 0 3.6 2.7 1.7 6.7l3.8 3c1-2.8 3.5-4.9 6.5-4.9Z"
      />
    </svg>
  );
}
