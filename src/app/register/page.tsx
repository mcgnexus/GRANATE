import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (!config.openRegistration) {
    return (
      <main className="bg-grain flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="panel w-full max-w-md p-8 text-center">
          <Lock size={30} className="mx-auto text-[var(--accent-2)]" />
          <h1 className="font-display mt-4 text-3xl">Registro cerrado</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Esta bóveda es de uso personal. La cuenta se crea desde el servidor con
            <code className="mx-1 rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[11px]">
              npm run user:create
            </code>
            y desde aquí solo se inicia sesión.
          </p>
          <Link href="/login" className="btn btn-primary mt-6 w-full">
            Ir a entrar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-grain flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <AuthForm mode="register" googleEnabled={config.googleEnabled} registrationOpen />
    </main>
  );
}
