"use client";

import { useState } from "react";
import { Hash, ChevronRight, ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type TagNode = { name: string; count: number; children: TagNode[] };

function buildTree(tags: Array<{ name: string; count: number }>): TagNode[] {
  const root: TagNode[] = [];
  const byPath = new Map<string, TagNode>();
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  for (const tag of sorted) {
    const parts = tag.name.split("/");
    let current = root;
    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
      let node = byPath.get(accumulated);
      if (!node) {
        node = { name: parts[i], count: 0, children: [] };
        byPath.set(accumulated, node);
        current.push(node);
      }
      if (i === parts.length - 1) node.count = tag.count;
      current = node.children;
    }
  }
  return root;
}

function TagRow({
  node,
  prefix,
  onPick,
}: {
  node: TagNode;
  prefix: string;
  onPick: (tag: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const full = prefix ? `${prefix}/${node.name}` : node.name;
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={() => onPick(full)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12.5px] text-[var(--text-soft)] hover:bg-[var(--panel-2)]"
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="grid h-4 w-4 place-items-center text-[var(--muted)]"
            aria-label={open ? "Colapsar" : "Expandir"}
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Hash size={12} className="text-[var(--accent-2)]" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.count ? <span className="text-[10px] text-[var(--muted)]">{node.count}</span> : null}
      </button>
      {open && hasChildren ? (
        <div className="ml-3">
          {node.children.map((child) => (
            <TagRow key={child.name} node={child} prefix={full} onPick={onPick} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TagsPanel({
  open,
  onClose,
  tags,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  tags: Array<{ name: string; count: number }>;
  onPick: (tag: string) => void;
}) {
  const tree = buildTree(tags);
  return (
    <Modal open={open} onClose={onClose} title="Etiquetas de la bóveda" subtitle="Anidadas por /">
      <div className="p-4">
        {tree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Sin etiquetas.</p>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TagRow key={node.name} node={node} prefix="" onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
