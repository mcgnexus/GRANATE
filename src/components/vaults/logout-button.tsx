"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className="btn btn-ghost h-8 gap-1.5 px-2 text-xs">
      <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
    </button>
  );
}
