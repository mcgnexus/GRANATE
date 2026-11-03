import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.verified === "1"
      ? "Email verificado. Ya puedes entrar."
      : params.error === "token"
        ? undefined
        : undefined;
  const error = params.error
    ? {
        token: "El enlace de verificación no es válido o ha caducado.",
        google: "Google no está configurado o ha fallado la autenticación.",
        google_state: "La sesión de Google caducó. Inténtalo de nuevo.",
        closed: "El registro está cerrado.",
      }[params.error]
    : undefined;

  return (
    <main className="bg-grain flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <AuthForm
        mode="login"
        notice={notice ?? error}
        googleEnabled={config.googleEnabled}
        registrationOpen={config.openRegistration}
      />
    </main>
  );
}
