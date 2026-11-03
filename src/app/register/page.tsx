import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <main className="bg-grain flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <AuthForm mode="register" />
    </main>
  );
}
