import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getVaultAccess } from "@/lib/auth/api";
import { Workspace } from "@/components/workspace/workspace";

export const metadata: Metadata = { title: "Bóveda" };

export default async function VaultPage({
  params,
}: {
  params: Promise<{ vaultId: string }>;
}) {
  const { vaultId } = await params;
  const user = await requireUser();
  const vault = await getVaultAccess(user.id, vaultId);
  if (!vault) notFound();

  return <Workspace vault={vault} />;
}
