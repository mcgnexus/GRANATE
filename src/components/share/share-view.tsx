"use client";

import { useRouter } from "next/navigation";
import { MarkdownPreview } from "@/components/workspace/markdown-preview";

export function ShareView({
  content,
  vaultId,
  token,
}: {
  content: string;
  vaultId: string;
  token: string;
}) {
  const router = useRouter();
  return (
    <MarkdownPreview
      content={content}
      vaultId={vaultId}
      onOpenNote={(path) => router.push(`/s/${token}?path=${encodeURIComponent(path)}`)}
      attachmentUrl={(target) => `/s/${token}/raw?path=${encodeURIComponent(target)}`}
    />
  );
}
